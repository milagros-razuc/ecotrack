const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../config/db.js');
const poolQueries = [];
let deviceRows = [{ cliente_id: 10 }];

const fakePool = {
  async query(sql, params = []) {
    poolQueries.push({ sql, params });
    if (sql.startsWith('SELECT cliente_id FROM dispositivos')) {
      return { rows: deviceRows };
    }
    return { rows: [] };
  },
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakePool,
};

const umbralesService = require('../services/umbrales.service');

function reset({ clienteId = 10 } = {}) {
  poolQueries.length = 0;
  deviceRows = [{ cliente_id: clienteId }];
}

test('CP-RF08 crea un umbral válido con notificaciones activas por defecto', async () => {
  reset();

  const result = await umbralesService.crearOActualizar({
    dispositivoCodigo: 'DEV-A',
    variable: 'temperatura',
    umbralMin: 10,
    umbralMax: 30,
    clienteId: 10,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(poolQueries.length, 2);
  assert.deepEqual(poolQueries[1].params, ['DEV-A', 'temperatura', 10, 30, true]);
});

test('CP-RF08 actualiza el umbral usando UNIQUE(dispositivo_codigo, variable) como upsert', async () => {
  reset();

  await umbralesService.crearOActualizar({
    dispositivoCodigo: 'DEV-A',
    variable: 'humedad',
    umbralMin: 20,
    umbralMax: 80,
    notificacionesActivas: false,
    clienteId: 10,
  });

  const upsertQuery = poolQueries[1];
  assert.match(upsertQuery.sql, /ON CONFLICT \(dispositivo_codigo, variable\)/);
  assert.match(upsertQuery.sql, /DO UPDATE SET/);
  assert.deepEqual(upsertQuery.params, ['DEV-A', 'humedad', 20, 80, false]);
});

test.todo('CP-RF08 rechaza umbral con mínimo igual al máximo en el servicio; hoy la validación vive en umbralSchema');
test.todo('CP-RF08 rechaza umbral con mínimo mayor al máximo en el servicio; hoy la validación vive en umbralSchema');

test('CP-RF08 rechaza un umbral cuyo dispositivo pertenece a otro cliente', async () => {
  reset({ clienteId: 20 });

  const result = await umbralesService.crearOActualizar({
    dispositivoCodigo: 'DEV-B',
    variable: 'luminosidad',
    umbralMin: 1,
    umbralMax: 99,
    clienteId: 10,
  });

  assert.deepEqual(result, { error: 'Dispositivo no encontrado' });
  assert.equal(poolQueries.length, 1);
});
