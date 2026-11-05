const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createResetCredencialesService,
  ERROR_RESET_CREDENCIALES,
} = require('../services/resetCredenciales.service');
const {
  createDynamicSecurityService,
  RESPONSE_TOPIC,
} = require('../services/dynamicSecurity.service');

function fakePool(row, { updateFailure = false, commitFailure = false } = {}) {
  const state = { ...row };
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql === 'COMMIT') {
        if (commitFailure) throw new Error('commit failure with secret=do-not-log');
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes('FOR UPDATE')) return { rowCount: 1, rows: [{ ...state }] };
      if (sql.includes('UPDATE dispositivos_fabrica')) {
        if (updateFailure) throw new Error('update failure with password=secret');
        state.enrolled_at = null;
        return { rowCount: 1, rows: [{ device_id: state.device_id }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    release() {},
  };
  return {
    state,
    calls,
    async connect() { return client; },
  };
}

function enrolledRow(overrides = {}) {
  return {
    device_id: 'DEVICE-A',
    enrolled_at: new Date(),
    cliente_id: 10,
    reclamado_en: new Date(),
    ...overrides,
  };
}

function dynamicDouble({ failure = null } = {}) {
  const calls = [];
  return {
    calls,
    async removeDevice(identity) {
      calls.push(identity);
      if (failure) throw new Error(failure);
    },
  };
}

function realResponseDynamicDouble(commands) {
  const client = {
    subscribe(_topic, _options, callback) { callback(); },
    unsubscribe() {},
    end() {},
    on(_event, listener) { this.listener = listener; },
    removeListener() {},
    publish(_topic, payload, options, callback) {
      const command = JSON.parse(payload).commands[0];
      commands.push(command.command);
      const correlationData = options.properties.correlationData;
      queueMicrotask(() => this.listener(
        RESPONSE_TOPIC,
        Buffer.from(JSON.stringify({
          responses: [{ command: command.command, success: true }],
        })),
        { properties: { correlationData } },
      ));
      callback();
    },
  };
  return createDynamicSecurityService({ connect: async () => client });
}

test('resetea dynsec antes de marcar enrolled_at NULL y conserva reclamo', async () => {
  const pool = fakePool(enrolledRow());
  const dynamic = dynamicDouble();
  const service = createResetCredencialesService({ pool, dynamicSecurity: dynamic });

  const result = await service.resetear({ deviceId: 'DEVICE-A', clienteId: 10 });

  assert.equal(result.status, 'reset');
  assert.equal(pool.state.enrolled_at, null);
  assert.equal(dynamic.calls.length, 1);
  assert.equal(pool.calls.findIndex((call) => call.sql.includes('UPDATE dispositivos_fabrica')),
    pool.calls.findIndex((call) => call.sql === 'COMMIT') - 1);
});

test('rechaza otro cliente sin tocar dynsec ni base', async () => {
  const pool = fakePool(enrolledRow({ cliente_id: 20 }));
  const dynamic = dynamicDouble();
  const service = createResetCredencialesService({ pool, dynamicSecurity: dynamic });

  await assert.rejects(
    service.resetear({ deviceId: 'DEVICE-A', clienteId: 10 }),
    new RegExp(ERROR_RESET_CREDENCIALES),
  );
  assert.equal(dynamic.calls.length, 0);
  assert.equal(pool.calls.filter((call) => call.sql.includes('UPDATE dispositivos_fabrica')).length, 0);
});

test('un dispositivo ya reseteado es idempotente y nunca reclamado se rechaza', async () => {
  const resetPool = fakePool(enrolledRow({ enrolled_at: null }));
  const resetDynamic = dynamicDouble();
  const resetService = createResetCredencialesService({
    pool: resetPool,
    dynamicSecurity: resetDynamic,
  });
  const result = await resetService.resetear({ deviceId: 'DEVICE-A', clienteId: 10 });
  assert.equal(result.status, 'already_reset');
  assert.equal(resetDynamic.calls.length, 0);

  const unclaimedPool = fakePool(enrolledRow({ cliente_id: null, reclamado_en: null }));
  const unclaimedDynamic = dynamicDouble();
  const unclaimedService = createResetCredencialesService({
    pool: unclaimedPool,
    dynamicSecurity: unclaimedDynamic,
  });
  await assert.rejects(
    unclaimedService.resetear({ deviceId: 'DEVICE-A', clienteId: 10 }),
    new RegExp(ERROR_RESET_CREDENCIALES),
  );
  assert.equal(unclaimedDynamic.calls.length, 0);
});

test('falla sin éxito y hace rollback si falla dynsec o persistencia', async () => {
  const dynamicFailurePool = fakePool(enrolledRow());
  const dynamicFailure = dynamicDouble({ failure: 'authorization denied' });
  const dynamicFailureService = createResetCredencialesService({
    pool: dynamicFailurePool,
    dynamicSecurity: dynamicFailure,
  });
  await assert.rejects(
    dynamicFailureService.resetear({ deviceId: 'DEVICE-A', clienteId: 10 }),
    new RegExp(ERROR_RESET_CREDENCIALES),
  );
  assert.equal(dynamicFailurePool.calls.some((call) => call.sql === 'ROLLBACK'), true);

  const persistenceFailurePool = fakePool(enrolledRow(), { updateFailure: true });
  const persistenceFailure = dynamicDouble();
  const persistenceFailureService = createResetCredencialesService({
    pool: persistenceFailurePool,
    dynamicSecurity: persistenceFailure,
  });
  await assert.rejects(
    persistenceFailureService.resetear({ deviceId: 'DEVICE-A', clienteId: 10 }),
    new RegExp(ERROR_RESET_CREDENCIALES),
  );
  assert.equal(persistenceFailure.calls.length, 1);
  assert.equal(persistenceFailurePool.calls.some((call) => call.sql === 'ROLLBACK'), true);
});

test('T003 elimina cliente y rol mediante respuestas dynsec reales antes de UPDATE fallido', async () => {
  const pool = fakePool(enrolledRow(), { updateFailure: true });
  const commands = [];
  const dynamic = realResponseDynamicDouble(commands);
  const service = createResetCredencialesService({ pool, dynamicSecurity: dynamic });

  await assert.rejects(
    service.resetear({ deviceId: 'DEVICE-A', clienteId: 10 }),
    new RegExp(ERROR_RESET_CREDENCIALES),
  );

  assert.deepEqual(commands, ['deleteClient', 'deleteRole']);
  assert.equal(pool.calls.some((call) => call.sql.includes('UPDATE dispositivos_fabrica')), true);
  assert.equal(pool.calls.some((call) => call.sql === 'ROLLBACK'), true);
});
