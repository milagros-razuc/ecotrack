const fs = require('fs');
const path = require('path');
const mqtt = require('../backend/node_modules/mqtt');

const repoRoot = path.resolve(__dirname, '..');
const statePath = process.env.DYNSEC_STATE_FILE
  || path.join(require('os').tmpdir(), 'ecotrack-dynsec-test-clients.json');
const reportPath = process.env.DYNSEC_REPORT_FILE
  || path.join(repoRoot, 'specs', '013-enrolamiento-dynamic-security', 'evidence', 'report.md');

function connect(client, state) {
  const mqttClient = mqtt.connect(state.brokerUrl, {
    username: client.username,
    password: client.password,
    ca: fs.readFileSync(state.caPath),
    rejectUnauthorized: true,
    protocolVersion: 5,
    clientId: `verify-${client.deviceId}-${Date.now()}`,
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connection timeout')), 10000);
    mqttClient.once('connect', () => {
      clearTimeout(timer);
      resolve(mqttClient);
    });
    mqttClient.once('error', (error) => {
      clearTimeout(timer);
      reject(new Error(error.message));
    });
  });
}

function publish(client, topic) {
  return new Promise((resolve) => {
    client.publish(topic, JSON.stringify({ test: true }), { qos: 1 }, (error) => {
      resolve(error ? { ok: false, detail: error.message } : { ok: true, detail: 'PUBACK' });
    });
  });
}

function subscribe(client, topic) {
  return new Promise((resolve) => {
    client.subscribe(topic, { qos: 1 }, (error, granted) => {
      if (error) resolve({ ok: false, detail: error.message });
      else resolve({
        ok: granted?.some((item) => item.qos === 128) === false,
        detail: granted?.map((item) => `qos=${item.qos}`).join(', ') || 'no grant',
      });
    });
  });
}

async function runCase(identity, state, operation, target, expectedAllowed) {
  let client;
  try {
    client = await connect(identity, state);
    const result = operation === 'publish'
      ? await publish(client, target)
      : await subscribe(client, target);
    const passed = result.ok === expectedAllowed;
    return { passed, result: result.ok ? 'allowed' : 'rejected', detail: result.detail };
  } catch (error) {
    const passed = expectedAllowed === false;
    return { passed, result: 'rejected', detail: error.message };
  } finally {
    if (client) client.end(true);
  }
}

async function main() {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const a = state.clients.find((client) => client.label === 'A');
  const b = state.clients.find((client) => client.label === 'B');
  if (!a || !b) throw new Error('A/B credentials are missing from the external state file');
  const cases = [
    ['A publish own', a, 'publish', `ecotrack/${a.deviceId}/lecturas`, true],
    ['A publish B', a, 'publish', `ecotrack/${b.deviceId}/lecturas`, false],
    ['A subscribe B', a, 'subscribe', `ecotrack/${b.deviceId}/lecturas`, false],
    ['B publish own', b, 'publish', `ecotrack/${b.deviceId}/lecturas`, true],
    ['B publish A', b, 'publish', `ecotrack/${a.deviceId}/lecturas`, false],
    ['B subscribe A', b, 'subscribe', `ecotrack/${a.deviceId}/lecturas`, false],
  ];
  const results = [];
  for (const [name, identity, operation, target, expectedAllowed] of cases) {
    const result = await runCase(identity, state, operation, target, expectedAllowed);
    results.push({ name, operation, target, expectedAllowed, ...result });
  }
  const approved = results.every((result) => result.passed);
  const report = [
    '# Dynamic Security Spike Report',
    '',
    `- Resultado: **${approved ? 'Aprobado' : 'Fallido'}**`,
    `- Fecha: ${new Date().toISOString()}`,
    '- ACL estático: activo durante la prueba',
    '',
    '| Caso | Operación | Topic | Esperado | Salida real | Estado |',
    '|---|---|---|---|---|---|',
    ...results.map((result) => `| ${result.name} | ${result.operation} | \`${result.target}\` | ${result.expectedAllowed ? 'permitido' : 'rechazado'} | ${result.result} (${result.detail}) | ${result.passed ? 'PASS' : 'FAIL'} |`),
    '',
    'Las contraseñas de A/B se generaron aleatoriamente y se conservaron únicamente en un archivo temporal fuera del repositorio.',
    '',
    '## Migración mínima si el ACL estático bloquea clientes dinámicos',
    '',
    'No se aplica automáticamente. El paso previsto es mover el usuario backend al plugin dynamic-security, verificar la convivencia y retirar `password_file` y `acl_file` de `mosquitto.conf` solo con aprobación explícita y rollback disponible.',
  ].join('\n');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report + '\n');
  console.log(report);
  if (!approved) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
