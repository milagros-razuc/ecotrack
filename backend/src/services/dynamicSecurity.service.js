const crypto = require('crypto');
const fs = require('fs');
const mqtt = require('mqtt');

const CONTROL_TOPIC = '$CONTROL/dynamic-security/v1';
const RESPONSE_TOPIC = '$CONTROL/dynamic-security/v1/response';

function createMqttClient() {
  const brokerUrl = process.env.DYNSEC_BROKER_URL
    || `mqtts://${process.env.MQTT_HOST || 'localhost'}:${process.env.MQTT_PORT || 8883}`;
  const caPath = process.env.DYNSEC_CA_PATH;
  const options = {
    username: process.env.DYNSEC_ADMIN_USER,
    password: process.env.DYNSEC_ADMIN_PASS,
    protocolVersion: 5,
    rejectUnauthorized: true,
  };
  if (caPath) options.ca = fs.readFileSync(caPath);

  const client = mqtt.connect(brokerUrl, options);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('dynamic-security connection timeout')), 10000);
    const fail = () => {
      clearTimeout(timer);
      reject(new Error('dynamic-security connection failed'));
    };
    client.once('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once('error', fail);
  });
}

function requestCommand(client, command) {
  const correlationData = crypto.randomUUID();
  const payload = JSON.stringify({ commands: [command], correlationData });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.removeListener('message', onMessage);
      reject(new Error('dynamic-security timeout'));
    }, 10000);

    function finish(error, response) {
      clearTimeout(timer);
      client.removeListener('message', onMessage);
      if (error) reject(error);
      else resolve(response);
    }

    function onMessage(topic, message, packet) {
      if (topic !== RESPONSE_TOPIC) return;
      let response;
      try {
        response = JSON.parse(message.toString());
      } catch {
        finish(new Error('dynamic-security malformed response'));
        return;
      }
      const commandResponse = response.responses?.find((item) => item.command === command.command);
      const responseCorrelation = packet.properties?.correlationData?.toString()
        || response.correlationData;
      if (responseCorrelation && responseCorrelation !== correlationData) return;
      if (!commandResponse) return;
      if (commandResponse.error) {
        finish(new Error('dynamic-security command rejected'));
        return;
      }
      finish(null, commandResponse);
    }

    client.on('message', onMessage);
    client.publish(
      CONTROL_TOPIC,
      payload,
      { qos: 1, properties: { correlationData: Buffer.from(correlationData) } },
      (error) => {
        if (error) finish(new Error('dynamic-security command publish failed'));
      },
    );
  });
}

function validateDeviceId(deviceId) {
  if (!/^[A-Za-z0-9_-]+$/.test(deviceId)) {
    throw new Error('invalid device id');
  }
}

function identityFor(deviceId, password) {
  validateDeviceId(deviceId);
  return {
    username: `ecotrack-${deviceId.toLowerCase()}`,
    roleName: `role-${deviceId}`,
    password,
    topic: `ecotrack/${deviceId}/#`,
  };
}

function createDynamicSecurityService({ connect = createMqttClient, request = requestCommand } = {}) {
  async function runCommands(commands, existingClient) {
    const client = existingClient || await connect();
    let subscribed = false;
    try {
      if (!existingClient) {
        await new Promise((resolve, reject) => {
          client.subscribe(RESPONSE_TOPIC, { qos: 1 }, (error) => {
            if (error) reject(new Error('dynamic-security response subscription failed'));
            else {
              subscribed = true;
              resolve();
            }
          });
        });
      }
      const responses = [];
      for (const command of commands) responses.push(await request(client, command));
      return { client, responses };
    } finally {
      if (!existingClient) {
        if (subscribed) client.unsubscribe(RESPONSE_TOPIC);
        client.end(true);
      }
    }
  }

  async function provisionDevice({ deviceId, password }) {
    const identity = identityFor(deviceId, password);
    const commands = [
      { command: 'createRole', rolename: identity.roleName },
      {
        command: 'addRoleACL',
        rolename: identity.roleName,
        acltype: 'publishClientSend',
        topic: `ecotrack/${deviceId}/lecturas`,
        allow: true,
      },
      {
        command: 'addRoleACL',
        rolename: identity.roleName,
        acltype: 'subscribePattern',
        topic: 'ecotrack/#',
        allow: false,
        priority: 0,
      },
      {
        command: 'addRoleACL',
        rolename: identity.roleName,
        acltype: 'subscribePattern',
        topic: identity.topic,
        allow: true,
        priority: 10,
      },
      {
        command: 'createClient',
        username: identity.username,
        password: identity.password,
        roles: [{ rolename: identity.roleName, priority: 1 }],
      },
    ];

    try {
      await runCommands(commands);
      return identity;
    } catch (error) {
      try {
        await removeDevice(identity);
      } catch (rollbackError) {
        error.rollbackFailed = true;
      }
      throw error;
    }
  }

  async function removeDevice(identity) {
    await runCommands([
      { command: 'deleteClient', username: identity.username },
      { command: 'deleteRole', rolename: identity.roleName },
    ]);
  }

  return { provisionDevice, removeDevice };
}

module.exports = {
  createDynamicSecurityService,
  identityFor,
  CONTROL_TOPIC,
  RESPONSE_TOPIC,
};
