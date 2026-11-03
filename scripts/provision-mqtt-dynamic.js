const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createDynamicSecurityService,
  validateDeviceId,
  validateStaticUsernames,
} = require('../backend/src/services/dynamicSecurity.service');

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

async function main() {
  const adminUser = readEnv('DYNSEC_ADMIN_USER');
  const adminPass = readEnv('DYNSEC_ADMIN_PASS');
  process.env.DYNSEC_ADMIN_USER = adminUser;
  process.env.DYNSEC_ADMIN_PASS = adminPass;
  const service = createDynamicSecurityService();

  if (process.argv[2] === '--remove') {
    const deviceId = process.argv[3];
    if (!deviceId || process.argv.length > 4) throw new Error('Usage: node scripts/provision-mqtt-dynamic.js --remove <deviceId>');
    validateDeviceId(deviceId);
    await service.removeDevice({ deviceId });
    console.log(`Removed Dynamic Security identity for ${deviceId}`);
    return;
  }
  if (process.argv.length > 2) {
    throw new Error('Usage: node scripts/provision-mqtt-dynamic.js [--remove <deviceId>]');
  }

  for (const entry of clientNames) validateDeviceId(entry.deviceId);
  const passwdPath = process.env.DYNSEC_PASSWD_PATH
    || path.join(repoRoot, 'mosquitto', 'config', 'passwd');
  validateStaticUsernames(adminUser, clientNames.map((entry) => entry.deviceId), passwdPath);
  const clients = [];
  for (const entry of clientNames) {
    clients.push({ label: entry.label, ...await service.provisionDevice({ deviceId: entry.deviceId }) });
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ brokerUrl, caPath, clients }), { mode: 0o600 });
    fs.chmodSync(statePath, 0o600);
  }
  console.log(`Provisioned dynamic-security clients A/B; credentials stored outside repo at ${statePath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { validateDeviceId };
