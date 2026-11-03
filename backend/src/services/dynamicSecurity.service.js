const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mqtt = require('mqtt');

const CONTROL_TOPIC = '$CONTROL/dynamic-security/v1';
const RESPONSE_TOPIC = `${CONTROL_TOPIC}/response`;

function validateDeviceId(deviceId) {
  if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(deviceId)) {
    throw new Error('Invalid device id');
  }
}

function validateStaticUsernames(adminUser, deviceIds, passwdPath) {
  if (!fs.existsSync(passwdPath)) throw new Error('Static passwd file is required for duplicate-name validation');
  const users = new Set(fs.readFileSync(passwdPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(':', 1)[0]));
  const ids = Array.isArray(deviceIds) ? deviceIds : [deviceIds];
  const dynamicNames = [adminUser, ...ids.map((deviceId) => `ecotrack-${deviceId.toLowerCase()}`)];
  if (new Set(dynamicNames).size !== dynamicNames.length) {
    throw new Error('Dynamic usernames must be unique');
  }
  const duplicate = dynamicNames.find((username) => users.has(username));
  if (duplicate) throw new Error(`Dynamic username also exists in static passwd: ${duplicate}`);
}

function createDynamicSecurityService({
  mqttModule = mqtt,
  env = process.env,
  fsModule = fs,
  timeoutMs = 10000,
} = {}) {
  const repoRoot = path.resolve(__dirname, '../../..');
  const brokerHost = env.MQTT_HOST || 'localhost';
  const brokerPort = env.MQTT_PORT || '8883';
  const brokerUrl = env.DYNSEC_BROKER_URL || `mqtts://${brokerHost}:${brokerPort}`;
  const caPath = env.DYNSEC_CA_PATH || env.MQTT_CA_PATH
    || path.join(repoRoot, 'mosquitto/config/certs/ecotrack-ca.crt');
  const passwdPath = env.DYNSEC_PASSWD_PATH || path.join(repoRoot, 'mosquitto/config/passwd');

  function connectAdmin() {
    const username = env.DYNSEC_ADMIN_USER;
    const password = env.DYNSEC_ADMIN_PASS;
    if (!username || !password) throw new Error('Dynamic Security admin credentials are not configured');
    const client = mqttModule.connect(brokerUrl, {
      username,
      password,
      ca: fsModule.readFileSync(caPath),
      rejectUnauthorized: true,
      protocolVersion: 5,
      reconnectPeriod: 0,
      connectTimeout: timeoutMs,
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('MQTT connection timeout')), timeoutMs);
      function finish(error) {
        clearTimeout(timer);
        client.removeListener('error', onError);
        if (error) {
          client.end(true);
          reject(error);
        } else {
          resolve(client);
        }
      }
      function onError(error) {
        finish(new Error(`MQTT TLS connection failed: ${error.message}`));
      }
      client.once('connect', () => finish());
      client.once('error', onError);
    });
  }

  function request(client, command) {
    const correlationData = crypto.randomUUID();
    const payload = JSON.stringify({ commands: [command], correlationData });
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(new Error(`Dynamic Security timeout: ${command.command}`)), timeoutMs);
      function finish(error, response) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.removeListener('message', onMessage);
        if (error) reject(error);
        else resolve(response);
      }
      function onMessage(topic, message, packet = {}) {
        if (topic !== RESPONSE_TOPIC) return;
        const packetCorrelation = packet.properties?.correlationData?.toString();
        let response;
        try {
          response = JSON.parse(message.toString());
        } catch {
          finish(new Error('Malformed Dynamic Security response'));
          return;
        }
        const responseCorrelation = packetCorrelation || response.correlationData;
        if (responseCorrelation !== correlationData) return;
        if (!Array.isArray(response.responses) || response.responses.length !== 1
          || response.responses[0].command !== command.command) {
          finish(new Error(`Unexpected Dynamic Security response: ${command.command}`));
          return;
        }
        if (response.responses[0].error) {
          finish(new Error(`Dynamic Security rejected ${command.command}`));
          return;
        }
        finish(null, response.responses[0]);
      }
      client.on('message', onMessage);
      client.publish(CONTROL_TOPIC, payload, {
        qos: 1,
        properties: { correlationData: Buffer.from(correlationData) },
      }, (error) => {
        if (error) finish(new Error(`Dynamic Security publish failed: ${command.command}`));
      });
    });
  }

  async function withAdmin(callback) {
    const client = await connectAdmin();
    try {
      await new Promise((resolve, reject) => {
        client.subscribe(RESPONSE_TOPIC, { qos: 1 }, (error) => {
          if (error) reject(new Error('Could not subscribe to Dynamic Security responses'));
          else resolve();
        });
      });
      return await callback(client);
    } finally {
      client.end(true);
    }
  }

  async function provisionDevice({ deviceId, password = crypto.randomBytes(32).toString('base64url') }) {
    validateDeviceId(deviceId);
    const adminUser = env.DYNSEC_ADMIN_USER;
    validateStaticUsernames(adminUser, deviceId, passwdPath);
    const username = `ecotrack-${deviceId.toLowerCase()}`;
    const roleName = `role-${deviceId}`;
    const topic = `ecotrack/${deviceId}`;
    return withAdmin(async (client) => {
      let roleCreated = false;
      try {
        await request(client, { command: 'createRole', rolename: roleName });
        roleCreated = true;
        await request(client, {
          command: 'addRoleACL', rolename: roleName, acltype: 'publishClientSend',
          topic: `${topic}/lecturas`, allow: true,
        });
        await request(client, {
          command: 'addRoleACL', rolename: roleName, acltype: 'subscribePattern',
          topic: 'ecotrack/#', allow: false, priority: 0,
        });
        await request(client, {
          command: 'addRoleACL', rolename: roleName, acltype: 'subscribePattern',
          topic: `${topic}/#`, allow: true, priority: 10,
        });
        await request(client, {
          command: 'createClient', username, password,
          roles: [{ rolename: roleName, priority: 1 }],
        });
      } catch (error) {
        if (roleCreated) {
          try {
            await request(client, { command: 'deleteRole', rolename: roleName });
          } catch {
            throw new Error(`${error.message}; partial provisioning requires Dynamic Security state inspection`);
          }
        }
        throw error;
      }
      return { deviceId, username, password, roleName, topic: `${topic}/lecturas` };
    });
  }

  async function removeDevice({ deviceId }) {
    validateDeviceId(deviceId);
    const username = `ecotrack-${deviceId.toLowerCase()}`;
    const roleName = `role-${deviceId}`;
    return withAdmin(async (client) => {
      await request(client, { command: 'deleteClient', username });
      await request(client, { command: 'deleteRole', rolename: roleName });
      return { deviceId, username, roleName, removed: true };
    });
  }

  return { provisionDevice, removeDevice };
}

module.exports = {
  CONTROL_TOPIC,
  RESPONSE_TOPIC,
  createDynamicSecurityService,
  validateDeviceId,
  validateStaticUsernames,
};
