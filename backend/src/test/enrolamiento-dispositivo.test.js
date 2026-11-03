const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const test = require('node:test');

const createEnrollmentRouter = require('../routes/enrolamiento');
const {
  createEnrollmentService,
  hashFactorySecret,
  hashesEqual,
} = require('../services/enrolamiento.service');
const { createDynamicSecurityService } = require('../services/dynamicSecurity.service');

function fakePool(rowsByDevice, { failUpdate = false } = {}) {
  const state = new Map(Object.entries(rowsByDevice));
  const client = {
    async query(sql, params = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT f.device_id')) {
        const row = state.get(params[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [{ ...row }] : [] };
      }
      if (sql.includes('UPDATE dispositivos_fabrica')) {
        if (failUpdate) throw new Error('simulated local persistence failure');
        const row = state.get(params[0]);
        if (!row || row.enrolled_at) return { rowCount: 0, rows: [] };
        row.enrolled_at = new Date();
        return { rowCount: 1, rows: [{ device_id: params[0] }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    release() {},
  };
  return {
    state,
    async connect() {
      return client;
    },
  };
}

function provisionerSpy({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async provisionDevice(identity) {
      calls.push({ action: 'provision', ...identity });
      if (fail) throw new Error('simulated dynamic-security failure');
      return {
        username: `ecotrack-${identity.deviceId.toLowerCase()}`,
        password: identity.password,
      };
    },
    async removeDevice(identity) {
      calls.push({ action: 'remove', ...identity });
    },
  };
}

function request(router, body, { https = true } = {}) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      const port = server.address().port;
      const req = http.request({
        port,
        method: 'POST',
        path: '/',
        headers: {
          'content-type': 'application/json',
          ...(https ? { 'x-forwarded-proto': 'https' } : {}),
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close(() => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        });
      });
      req.on('error', (error) => server.close(() => reject(error)));
      req.end(JSON.stringify(body));
    });
  });
}

function row(deviceId, secret, clienteId) {
  return {
    device_id: deviceId,
    factory_secret_hash: hashFactorySecret(secret),
    enrolled_at: null,
    cliente_id: clienteId,
    reclamado_en: new Date(),
  };
}

test('enrolamiento A/B entrega credenciales aisladas y una sola vez', async () => {
  const pool = fakePool({
    'DEVICE-A': row('DEVICE-A', 'secret-a', 10),
    'DEVICE-B': row('DEVICE-B', 'secret-b', 20),
  });
  const dynamic = provisionerSpy();
  const service = createEnrollmentService({
    pool,
    dynamicSecurity: dynamic,
    randomBytes: () => Buffer.from('fixed-test-password'),
  });

  const firstA = await service.enrolar({ deviceId: 'DEVICE-A', deviceSecret: 'secret-a' });
  const firstB = await service.enrolar({ deviceId: 'DEVICE-B', deviceSecret: 'secret-b' });
  assert.equal(firstA.device_id, 'DEVICE-A');
  assert.equal(firstB.device_id, 'DEVICE-B');
  assert.notEqual(firstA.mqtt_user, firstB.mqtt_user);
  assert.notEqual(firstA.mqtt_pass, undefined);
  await assert.rejects(
    service.enrolar({ deviceId: 'DEVICE-A', deviceSecret: 'secret-a' }),
    /No se pudo enrolar el dispositivo/,
  );
  assert.equal(dynamic.calls.filter((call) => call.action === 'provision').length, 2);
});

test('secreto incorrecto y dispositivo no reclamado usan comparación fija y rechazo genérico', async () => {
  assert.equal(hashesEqual(hashFactorySecret('correct'), hashFactorySecret('correct')), true);
  assert.equal(hashesEqual(hashFactorySecret('correct'), hashFactorySecret('wrong')), false);
  const pool = fakePool({
    'DEVICE-X': row('DEVICE-X', 'correct', null),
  });
  const service = createEnrollmentService({ pool, dynamicSecurity: provisionerSpy() });
  await assert.rejects(
    service.enrolar({ deviceId: 'DEVICE-X', deviceSecret: 'wrong' }),
    /No se pudo enrolar el dispositivo/,
  );
  await assert.rejects(
    service.enrolar({ deviceId: 'DEVICE-UNKNOWN', deviceSecret: 'wrong' }),
    /No se pudo enrolar el dispositivo/,
  );
});

test('fallo de dynamic-security no marca el dispositivo ni deja identidad', async () => {
  const pool = fakePool({ 'DEVICE-FAIL': row('DEVICE-FAIL', 'secret', 10) });
  const dynamic = provisionerSpy({ fail: true });
  const service = createEnrollmentService({ pool, dynamicSecurity: dynamic });
  await assert.rejects(
    service.enrolar({ deviceId: 'DEVICE-FAIL', deviceSecret: 'secret' }),
    /No se pudo enrolar el dispositivo/,
  );
  assert.equal(pool.state.get('DEVICE-FAIL').enrolled_at, null);
  assert.equal(dynamic.calls.filter((call) => call.action === 'remove').length, 0);
});

test('fallo de persistencia compensa cliente MQTT y mantiene estado local pendiente', async () => {
  const pool = fakePool({ 'DEVICE-ROLLBACK': row('DEVICE-ROLLBACK', 'secret', 10) }, { failUpdate: true });
  const dynamic = provisionerSpy();
  const service = createEnrollmentService({ pool, dynamicSecurity: dynamic });
  await assert.rejects(
    service.enrolar({ deviceId: 'DEVICE-ROLLBACK', deviceSecret: 'secret' }),
    /No se pudo enrolar el dispositivo/,
  );
  assert.equal(pool.state.get('DEVICE-ROLLBACK').enrolled_at, null);
  assert.deepEqual(dynamic.calls.map((call) => call.action), ['provision', 'remove']);
});

test('dynamic-security incluye denegación explícita de suscripción global y permiso propio', async () => {
  const commands = [];
  const fakeClient = {
    subscribe(_topic, _options, callback) { callback(); },
    unsubscribe() {},
    end() {},
  };
  const dynamic = createDynamicSecurityService({
    connect: async () => fakeClient,
    request: async (_client, command) => {
      commands.push(command);
      return {};
    },
  });
  await dynamic.provisionDevice({ deviceId: 'DEVICE-A', password: 'not-logged' });
  const subscribeRules = commands.filter((command) => command.acltype === 'subscribePattern');
  assert.deepEqual(
    subscribeRules.map(({ topic, allow, priority }) => ({ topic, allow, priority })),
    [
      { topic: 'ecotrack/#', allow: false, priority: 0 },
      { topic: 'ecotrack/DEVICE-A/#', allow: true, priority: 10 },
    ],
  );
});

test('endpoint exige HTTPS y devuelve el mismo error para body inválido', async () => {
  const service = {
    async enrolar() {
      throw new Error('must not be called');
    },
  };
  const router = createEnrollmentRouter({ service });
  const response = await request(router, {
    device_id: 'DEVICE-A',
    device_secret: 'secret',
    token: 'forbidden',
  }, { https: true });
  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { error: 'No se pudo enrolar el dispositivo' });

  const httpResponse = await request(router, {
    device_id: 'DEVICE-A',
    device_secret: 'secret',
  }, { https: false });
  assert.equal(httpResponse.status, 409);
  assert.deepEqual(httpResponse.body, response.body);
});

test('endpoint acepta el contrato exacto y no toma cliente_id del body', async () => {
  const calls = [];
  const router = createEnrollmentRouter({
    service: {
      async enrolar(input) {
        calls.push(input);
        return {
          device_id: 'DEVICE-A',
          mqtt_user: 'generated-user',
          mqtt_pass: 'generated-pass',
          mqtt_host: 'broker',
          mqtt_port: 8883,
        };
      },
    },
  });
  const response = await request(router, {
    device_id: 'DEVICE-A',
    device_secret: 'secret-a',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.device_id, 'DEVICE-A');
  assert.deepEqual(calls, [{ deviceId: 'DEVICE-A', deviceSecret: 'secret-a' }]);
});
