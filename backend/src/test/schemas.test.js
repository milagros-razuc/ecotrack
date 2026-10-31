const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const { lecturaMqttSchema } = require('../schemas');

const servicePaths = {
  dispositivos: path.resolve(__dirname, '../services/dispositivos.service.js'),
  lecturas: path.resolve(__dirname, '../services/lecturas.service.js'),
  umbrales: path.resolve(__dirname, '../services/umbrales.service.js'),
  alertas: path.resolve(__dirname, '../services/alertas.service.js'),
};

const calls = {
  contexto: 0,
  conexion: 0,
  guardar: 0,
  umbral: 0,
  alerta: 0,
};

function resetCalls() {
  for (const key of Object.keys(calls)) calls[key] = 0;
}

function installMqttServiceDoubles() {
  require.cache[servicePaths.dispositivos] = {
    id: servicePaths.dispositivos,
    filename: servicePaths.dispositivos,
    loaded: true,
    exports: {
      async obtenerContextoLectura() {
        calls.contexto += 1;
        return { activo: true, cliente_id: 7, reclamado_en: null };
      },
      async registrarConexion() {
        calls.conexion += 1;
      },
    },
  };
  require.cache[servicePaths.lecturas] = {
    id: servicePaths.lecturas,
    filename: servicePaths.lecturas,
    loaded: true,
    exports: {
      async guardar() {
        calls.guardar += 1;
      },
    },
  };
  require.cache[servicePaths.umbrales] = {
    id: servicePaths.umbrales,
    filename: servicePaths.umbrales,
    loaded: true,
    exports: {
      async obtener() {
        calls.umbral += 1;
        return null;
      },
    },
  };
  require.cache[servicePaths.alertas] = {
    id: servicePaths.alertas,
    filename: servicePaths.alertas,
    loaded: true,
    exports: {
      async registrar() {
        calls.alerta += 1;
        return null;
      },
    },
  };
}

installMqttServiceDoubles();
const { procesarMensaje } = require('../mqtt/client');

const validPayload = {
  temperatura: 20,
  humedad: 50,
  luminosidad: 50,
};

const fakeIo = {
  to() {
    return { emit() {} };
  },
};

function assertSchemaRejects(payload, expectedPaths = []) {
  const result = lecturaMqttSchema.safeParse(payload);
  assert.equal(result.success, false);
  assert.ok(result.error.issues.length > 0);
  for (const expectedPath of expectedPaths) {
    assert.ok(
      result.error.issues.some((issue) => issue.path.join('.') === expectedPath),
      `se esperaba un error en ${expectedPath}`
    );
  }
}

async function assertHandlerDoesNotPersist(payload, message = JSON.stringify(payload)) {
  resetCalls();
  await procesarMensaje(fakeIo, 'ecotrack/test-device/lecturas', Buffer.from(message), new Date('2026-01-01T12:00:00.000Z'));
  assert.equal(calls.guardar, 0);
  assert.equal(calls.conexion, 0);
  assert.equal(calls.umbral, 0);
  assert.equal(calls.alerta, 0);
}

test('CP-RF04 acepta un payload válido y el handler persiste la lectura', async () => {
  const result = lecturaMqttSchema.safeParse(validPayload);
  assert.equal(result.success, true);

  resetCalls();
  await procesarMensaje(fakeIo, 'ecotrack/test-device/lecturas', Buffer.from(JSON.stringify(validPayload)), new Date('2026-01-01T12:00:00.000Z'));
  assert.equal(calls.contexto, 1);
  assert.equal(calls.conexion, 1);
  assert.equal(calls.guardar, 1);
});

for (const missingField of ['temperatura', 'humedad', 'luminosidad']) {
  test(`CP-RF04 rechaza payload con campo faltante: ${missingField} y no persiste`, async () => {
    const payload = { ...validPayload };
    delete payload[missingField];
    assertSchemaRejects(payload, [missingField]);
    await assertHandlerDoesNotPersist(payload);
  });
}

for (const field of Object.keys(validPayload)) {
  for (const invalidValue of ['20', null, true, []]) {
    test(`CP-RF04 rechaza ${field} con tipo ${invalidValue === null ? 'null' : Array.isArray(invalidValue) ? 'array' : typeof invalidValue} y no persiste`, async () => {
      const payload = { ...validPayload, [field]: invalidValue };
      assertSchemaRejects(payload, [field]);
      await assertHandlerDoesNotPersist(payload);
    });
  }
}

for (const field of Object.keys(validPayload)) {
  for (const invalidNumber of [Number.NaN, Number.POSITIVE_INFINITY]) {
    test(`CP-RF04 rechaza ${field} con ${Number.isNaN(invalidNumber) ? 'NaN' : 'Infinity'} y no persiste`, async () => {
      const payload = { ...validPayload, [field]: invalidNumber };
      assertSchemaRejects(payload, [field]);
      await assertHandlerDoesNotPersist(payload, JSON.stringify(payload).replace('null', 'NaN'));
    });
  }
}

const boundaryCases = [
  ['temperatura mínima', { ...validPayload, temperatura: -40 }],
  ['temperatura máxima', { ...validPayload, temperatura: 80 }],
  ['humedad mínima', { ...validPayload, humedad: 0 }],
  ['humedad máxima', { ...validPayload, humedad: 100 }],
  ['luminosidad mínima', { ...validPayload, luminosidad: 0 }],
  ['luminosidad máxima', { ...validPayload, luminosidad: 100 }],
];

for (const [label, payload] of boundaryCases) {
  test(`CP-RF04 acepta ${label} en el límite físico exacto y persiste`, async () => {
    assert.equal(lecturaMqttSchema.safeParse(payload).success, true);
    resetCalls();
    await procesarMensaje(fakeIo, 'ecotrack/test-device/lecturas', Buffer.from(JSON.stringify(payload)), new Date('2026-01-01T12:00:00.000Z'));
    assert.equal(calls.guardar, 1);
  });
}

const outOfRangeCases = [
  ['temperatura menor', 'temperatura', -40.001],
  ['temperatura mayor', 'temperatura', 80.001],
  ['humedad menor', 'humedad', -0.001],
  ['humedad mayor', 'humedad', 100.001],
  ['luminosidad menor', 'luminosidad', -0.001],
  ['luminosidad mayor', 'luminosidad', 100.001],
];

for (const [label, field, value] of outOfRangeCases) {
  test(`CP-RF04 rechaza ${label} apenas fuera de rango y no persiste`, async () => {
    const payload = { ...validPayload, [field]: value };
    assertSchemaRejects(payload, [field]);
    await assertHandlerDoesNotPersist(payload);
  });
}

test('CP-RF04 acepta campos extra, elimina el extra y persiste sin afectar el contrato', async () => {
  const payload = { ...validPayload, extra: 'ignorado' };
  const result = lecturaMqttSchema.safeParse(payload);
  assert.equal(result.success, true);
  assert.equal(Object.hasOwn(result.data, 'extra'), false);

  resetCalls();
  await procesarMensaje(fakeIo, 'ecotrack/test-device/lecturas', Buffer.from(JSON.stringify(payload)), new Date('2026-01-01T12:00:00.000Z'));
  assert.equal(calls.guardar, 1);
});

test('CP-RF04 rechaza objeto vacío y el handler no persiste', async () => {
  assertSchemaRejects({}, ['temperatura', 'humedad', 'luminosidad']);
  await assertHandlerDoesNotPersist({});
});
