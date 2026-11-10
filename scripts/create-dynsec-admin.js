const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const mqtt = require('../backend/node_modules/mqtt');

const container = process.env.DYNSEC_CONTAINER || 'ecotrack_mqtt';
const envPath = process.env.DYNSEC_ENV_FILE || path.join(process.cwd(), '.env');
const caPath = process.env.DYNSEC_CA_PATH
  || path.join(process.cwd(), 'mosquitto', 'config', 'certs', 'ecotrack-ca.crt');

function readEnv(name) {
  const line = fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => new RegExp(`^${name}=`).test(entry));
  if (!line) throw new Error(`Missing ${name} in ${envPath}`);
  return line.slice(name.length + 1).replace(/^(['"])(.*)\1$/, '$2');
}

function readDefaultPassword() {
  return execFileSync('docker', [
    'exec',
    container,
    'sh',
    '-c',
    "sed -n 's/^admin //p' /mosquitto/data/dynamic-security.json.pw",
  ], { encoding: 'utf8' }).trim();
}

function request(client, command) {
  const correlationData = `ecotrack-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const payload = JSON.stringify({ commands: [command], correlationData });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout for ${command.command}`)), 10000);
    const onMessage = (topic, message, packet) => {
      if (topic !== '$CONTROL/dynamic-security/v1/response') return;
      let response;
      try {
        response = JSON.parse(message.toString());
      } catch {
        clearTimeout(timer);
        client.removeListener('message', onMessage);
        reject(new Error('Malformed dynamic-security response'));
        return;
      }

      const responseCorrelation = packet.properties?.correlationData?.toString()
        || response.correlationData;
      const firstResponse = Array.isArray(response.responses) ? response.responses[0] : null;
      const commandMatches = firstResponse?.command === command.command;
      if (responseCorrelation && responseCorrelation !== correlationData) return;
      if (!responseCorrelation && !commandMatches) return;
      clearTimeout(timer);
      client.removeListener('message', onMessage);
      if (response.error || firstResponse?.error) {
        reject(new Error(`Dynamic-security command rejected: ${command.command}`));
        return;
      }
      resolve(response);
    };

    client.on('message', onMessage);
    client.publish('$CONTROL/dynamic-security/v1', payload, {
      qos: 1,
      properties: { correlationData: Buffer.from(correlationData) },
    }, (error) => {
      if (error) {
        clearTimeout(timer);
        client.removeListener('message', onMessage);
        reject(new Error(`Could not publish ${command.command}`));
      }
    });
  });
}

async function main() {
  const adminUser = readEnv('DYNSEC_ADMIN_USER');
  const adminPass = readEnv('DYNSEC_ADMIN_PASS');
  if (!adminUser || !adminPass || adminUser === 'admin' || adminUser === 'democlient') {
    throw new Error('Invalid DYNSEC admin environment');
  }

  const client = mqtt.connect('mqtts://localhost:8883', {
    username: 'admin',
    password: readDefaultPassword(),
    ca: fs.readFileSync(caPath),
    rejectUnauthorized: true,
    protocolVersion: 5,
  });

  try {
    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('error', () => reject(new Error('Could not connect to dynamic-security control')));
    });
    await new Promise((resolve, reject) => {
      client.subscribe('$CONTROL/dynamic-security/v1/response', { qos: 1 }, (error) => {
        if (error) reject(new Error('Could not subscribe to dynamic-security responses'));
        else resolve();
      });
    });
    await request(client, {
      command: 'createClient',
      username: adminUser,
      password: adminPass,
    });
    await request(client, {
      command: 'addClientRole',
      username: adminUser,
      rolename: 'dynsec-admin',
      priority: 1,
    });
    console.log(`Created dynamic-security admin: ${adminUser}`);
  } finally {
    client.end(true);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
