const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mqtt = require('../backend/node_modules/mqtt');

const repoRoot = path.resolve(__dirname, '..');
const envPath = process.env.DYNSEC_ENV_FILE || path.join(repoRoot, '.env');
const statePath = process.env.DYNSEC_STATE_FILE
  || path.join(os.tmpdir(), 'ecotrack-dynsec-test-clients.json');
const brokerUrl = process.env.DYNSEC_BROKER_URL || 'mqtts://localhost:8883';
const caPath = process.env.DYNSEC_CA_PATH
  || path.join(repoRoot, 'mosquitto', 'config', 'certs', 'ecotrack-ca.crt');
const clientNames = [
  { label: 'A', deviceId: process.env.DYNSEC_DEVICE_A || 'DYNSEC-A' },
  { label: 'B', deviceId: process.env.DYNSEC_DEVICE_B || 'DYNSEC-B' },
];

function readEnv(name) {
  const line = fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => new RegExp(`^${name}=`).test(entry));
  if (!line) throw new Error(`Missing ${name} in ${envPath}`);
  return line.slice(name.length + 1).replace(/^(['"])(.*)\1$/, '$2');
}

function validateDeviceId(deviceId) {
  if (!/^[A-Za-z0-9_-]+$/.test(deviceId)) {
    throw new Error(`Invalid device id: ${deviceId}`);
  }
}

function randomPassword() {
  return crypto.randomBytes(32).toString('base64url');
}

function connect(options) {
  const client = mqtt.connect(brokerUrl, {
    ...options,
    ca: fs.readFileSync(caPath),
    rejectUnauthorized: true,
    protocolVersion: 5,
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MQTT connection timeout')), 10000);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.once('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`MQTT connection failed: ${error.message}`));
    });
  });
}

function request(client, command) {
  const correlationData = crypto.randomUUID();
  const payload = JSON.stringify({
    commands: [{ ...command }],
    correlationData,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.removeListener('message', onMessage);
      reject(new Error(`Dynamic Security timeout: ${command.command}`));
    }, 10000);
    function finish(error, response) {
      clearTimeout(timer);
      client.removeListener('message', onMessage);
      if (error) reject(error);
      else resolve(response);
    }
    function onMessage(topic, message, packet) {
      if (topic !== '$CONTROL/dynamic-security/v1/response') return;
      let response;
      try {
        response = JSON.parse(message.toString());
      } catch {
        finish(new Error('Malformed dynamic-security response'));
        return;
      }
      const commandResponse = Array.isArray(response.responses)
        ? response.responses.find((item) => item.command === command.command)
        : null;
      const responseCorrelation = packet.properties?.correlationData?.toString()
        || response.correlationData;
      if (responseCorrelation && responseCorrelation !== correlationData) return;
      if (!commandResponse) return;
      if (commandResponse.error) {
        finish(new Error(`Dynamic Security rejected: ${command.command}`));
        return;
      }
      finish(null, commandResponse);
    }
    client.on('message', onMessage);
    client.publish(
      '$CONTROL/dynamic-security/v1',
      payload,
      { qos: 1, properties: { correlationData: Buffer.from(correlationData) } },
      (error) => {
        if (error) finish(new Error(`Dynamic Security publish failed: ${command.command}`));
      },
    );
  });
}

async function ensureRole(client, roleName, topic) {
  try {
    await request(client, { command: 'createRole', rolename: roleName });
  } catch (error) {
    if (!error.message.includes('rejected')) throw error;
  }
  try {
    await request(client, {
      command: 'addRoleACL',
      rolename: roleName,
      acltype: 'publishClientSend',
      topic,
      allow: true,
    });
  } catch (error) {
    if (!error.message.includes('rejected')) throw error;
  }
  for (const acl of [
    { topic: 'ecotrack/#', allow: false, priority: 0 },
    { topic, allow: true, priority: 10 },
  ]) {
    try {
      await request(client, {
        command: 'addRoleACL',
        rolename: roleName,
        acltype: 'subscribePattern',
        ...acl,
      });
    } catch (error) {
      if (!error.message.includes('rejected')) throw error;
    }
  }
}

async function ensureClient(client, entry) {
  const username = `ecotrack-${entry.deviceId.toLowerCase()}`;
  const roleName = `role-${entry.deviceId}`;
  const password = randomPassword();
  const topic = `ecotrack/${entry.deviceId}/#`;
  validateDeviceId(entry.deviceId);
  await ensureRole(client, roleName, topic);
  try {
    await request(client, {
      command: 'createClient',
      username,
      password,
      roles: [{ rolename: roleName, priority: 1 }],
    });
  } catch (error) {
    if (!error.message.includes('rejected')) throw error;
    await request(client, { command: 'setClientPassword', username, password });
    try {
      await request(client, { command: 'addClientRole', username, rolename: roleName, priority: 1 });
    } catch (roleError) {
      if (!roleError.message.includes('rejected')) throw roleError;
    }
  }
  return { label: entry.label, deviceId: entry.deviceId, username, password, topic };
}

async function main() {
  const adminUser = readEnv('DYNSEC_ADMIN_USER');
  const adminPass = readEnv('DYNSEC_ADMIN_PASS');
  const admin = await connect({ username: adminUser, password: adminPass });
  try {
    await new Promise((resolve, reject) => {
      admin.subscribe('$CONTROL/dynamic-security/v1/response', { qos: 1 }, (error) => {
        if (error) reject(new Error('Could not subscribe to dynamic-security responses'));
        else resolve();
      });
    });
    const clients = [];
    for (const entry of clientNames) {
      clients.push(await ensureClient(admin, entry));
    }
    fs.writeFileSync(statePath, JSON.stringify({
      brokerUrl,
      caPath,
      clients,
    }), { mode: 0o600 });
    console.log(`Provisioned dynamic-security clients A/B; credentials stored outside repo at ${statePath}`);
  } finally {
    admin.end(true);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
