const fs = require('fs');
const path = require('path');
const mqtt = require('../backend/node_modules/mqtt');

const repoRoot = path.resolve(__dirname, '..');
const statePath = process.env.DYNSEC_STATE_FILE
  || path.join(require('os').tmpdir(), 'ecotrack-dynsec-test-clients.json');
const reportPath = process.env.DYNSEC_ACL_REPORT_FILE
  || path.join(repoRoot, 'specs', '013-enrolamiento-dynamic-security', 'evidence', 'acl-ab.md');

function connect(client, state) {
  const mqttClient = mqtt.connect(state.brokerUrl, {
    username: client.username,
    password: client.password,
    ca: fs.readFileSync(state.caPath),
    rejectUnauthorized: true,
    protocolVersion: 5,
    reconnectPeriod: 0,
    connectTimeout: 10000,
    clientId: `verify-${client.deviceId}-${Date.now()}`,
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      mqttClient.removeListener('error', onError);
      if (error) {
        mqttClient.end(true);
        reject(error);
      } else {
        resolve(mqttClient);
      }
    };
    const onError = (error) => finish(new Error(error.message));
    const timer = setTimeout(() => finish(new Error('connection timeout')), 10000);
    mqttClient.once('connect', () => finish());
    mqttClient.once('error', onError);
  });
}

function publish(client, topic) {
  return new Promise((resolve) => {
    client.publish(topic, JSON.stringify({ test: true }), { qos: 1 }, (error) => {
      resolve(error
        ? { ok: false, denied: isAuthorizationDenial(error.message), detail: error.message }
        : { ok: true, denied: false, detail: 'PUBACK' });
    });
  });
}

function isAuthorizationDenial(message) {
  return /not authorized|not authorised/i.test(message);
}

function subscribe(client, topic) {
  return new Promise((resolve) => {
    client.subscribe(topic, { qos: 1 }, (error, granted) => {
      if (error) resolve({ ok: false, denied: isAuthorizationDenial(error.message), detail: error.message });
      else {
        const denied = !granted?.length || granted.some((item) => item.qos === 128);
        resolve({
        ok: !denied && granted.every((item) => item.qos !== 128),
        denied,
        detail: granted?.map((item) => `qos=${item.qos}`).join(', ') || 'no grant',
        });
      }
    });
  });
}

async function runCase(identity, state, operation, target, expectedAllowed, connectClient = connect) {
  let client;
  try {
    client = await connectClient(identity, state);
    const result = operation === 'publish'
      ? await publish(client, target)
      : await subscribe(client, target);
    const passed = expectedAllowed ? result.ok : result.denied;
    return {
      passed,
      result: result.ok ? 'allowed' : (result.denied ? 'rejected' : 'error'),
      detail: result.detail,
    };
  } catch (error) {
    return { passed: false, result: 'error', detail: error.message };
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
  const passed = results.every((result) => result.passed);
  const report = [
    '# Dynamic Security A/B ACL Matrix',
    '',
    `- Resultado de esta matriz: **${passed ? 'PASS' : 'FAIL'} (${results.filter((result) => result.passed).length}/6)**`,
    `- Fecha: ${new Date().toISOString()}`,
    '- Alcance: solo verifica aislamiento A/B; no clasifica el spike completo ni convivencia estática/rollback.',
    '',
    '| Caso | Operación | Topic | Esperado | Salida real | Estado |',
    '|---|---|---|---|---|---|',
    ...results.map((result) => `| ${result.name} | ${result.operation} | \`${result.target}\` | ${result.expectedAllowed ? 'permitido' : 'rechazado'} | ${result.result} (${result.detail}) | ${result.passed ? 'PASS' : 'FAIL'} |`),
    '',
    'Las contraseñas de A/B se generaron aleatoriamente y se conservaron únicamente en un archivo temporal fuera del repositorio.',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report + '\n');
  console.log(report);
  if (!passed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { isAuthorizationDenial, publish, subscribe, runCase };
