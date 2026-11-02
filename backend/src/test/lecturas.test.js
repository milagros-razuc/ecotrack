const assert = require('node:assert/strict');
const { mock, test } = require('node:test');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../config/db.js');
const queries = [];
const fakePool = {
  async query(sql, params = []) {
    queries.push({ sql, params });

    if (sql.includes('date_trunc')) {
      return { rows: [{ periodo: '2026-10-31T00:00:00.000Z' }] };
    }
    if (sql.includes('DISTINCT ON')) {
      return { rows: [{ dispositivo_codigo: 'DEV-A', cliente_id: params[0] }] };
    }
    if (sql.includes('SELECT l.*, d.nombre')) {
      return { rows: [{ dispositivo_codigo: 'DEV-A', cliente_id: params[0] }] };
    }
    return { rows: [], rowCount: 1 };
  },
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakePool,
};

const lecturasService = require('../services/lecturas.service');

function reset() {
  queries.length = 0;
}

function lastQuery() {
  assert.ok(queries.length > 0);
  return queries[queries.length - 1];
}

test('CP-RF05 guarda una lectura asociada al dispositivo y conserva el cliente del dispositivo', async () => {
  reset();

  await lecturasService.guardar({
    dispositivoCodigo: 'DEV-A',
    temperatura: 22.5,
    humedad: 55,
    luminosidad: 700,
    timestamp: new Date('2026-10-31T15:00:00.000Z'),
  });

  const query = lastQuery();
  assert.match(query.sql, /INSERT INTO lecturas/);
  assert.match(query.sql, /SELECT d\.codigo/);
  assert.match(query.sql, /d\.cliente_id/);
  assert.match(query.sql, /d\.cliente_id IS NOT NULL/);
  assert.deepEqual(query.params, [
    'DEV-A',
    22.5,
    55,
    700,
    new Date('2026-10-31T15:00:00.000Z'),
  ]);
});

test('CP-RF05 descarta una lectura de dispositivo sin dueño sin guardar', async () => {
  reset();

  await lecturasService.guardar({
    dispositivoCodigo: 'DEV-SIN-DUENO',
    temperatura: 22,
    humedad: 50,
    luminosidad: 500,
  });

  const query = lastQuery();
  assert.match(query.sql, /d\.cliente_id IS NOT NULL/);
  assert.equal((query.sql.match(/INSERT INTO lecturas/g) || []).length, 1);
  assert.equal(query.params[0], 'DEV-SIN-DUENO');
});

test.todo('CP-RF05 debería descartar lecturas de dispositivos inactivos; la consulta actual solo exige cliente_id no nulo');

test('CP-RF23 conserva el instante de captura cuando el timestamp es válido', async () => {
  reset();
  const capturedAt = new Date('2026-10-31T14:30:00.000Z');

  await lecturasService.guardar({
    dispositivoCodigo: 'DEV-A',
    temperatura: 20,
    humedad: 40,
    luminosidad: 300,
    timestamp: capturedAt,
  });

  assert.deepEqual(lastQuery().params[4], capturedAt);
});

test('CP-RF23 usa la hora de recepción controlada cuando no se informa timestamp', async () => {
  reset();
  const receivedAt = new Date('2026-10-31T16:22:15.490Z');
  mock.timers.enable({ apis: ['Date'], now: receivedAt });

  try {
    await lecturasService.guardar({
      dispositivoCodigo: 'DEV-A',
      temperatura: 20,
      humedad: 40,
      luminosidad: 300,
    });

    assert.deepEqual(lastQuery().params[4], receivedAt);
  } finally {
    mock.timers.reset();
  }
});

test.todo('CP-RF23 debería usar la hora de recepción para timestamp inválido; el código actual lo persiste sin normalizar');
test.todo('CP-RF23 debería usar la hora de recepción para timestamp futuro; el código actual lo persiste sin normalizar');
test.todo('CP-RF23 debería usar la hora de recepción para epoch 0; el código actual lo persiste sin normalizar');

test('CP-RF23 CARACTERIZACIÓN: timestamp inválido se envía sin normalización al pool', async () => {
  reset();
  const invalidTimestamp = 'no-es-un-timestamp';

  await lecturasService.guardar({
    dispositivoCodigo: 'DEV-A',
    temperatura: 20,
    humedad: 40,
    luminosidad: 300,
    timestamp: invalidTimestamp,
  });

  assert.equal(lastQuery().params[4], invalidTimestamp);
});

test('CP-RF07 agrega por hora para día', async () => {
  reset();

  const rows = await lecturasService.listarAgregado({
    dispositivo: 'DEV-A',
    periodo: 'dia',
    clienteId: 10,
  });

  assert.equal(rows.length, 1);
  assert.match(lastQuery().sql, /date_trunc\('hour'/);
  assert.match(lastQuery().sql, /INTERVAL '1 day'/);
  assert.deepEqual(lastQuery().params, [10, 'DEV-A']);
});

test('CP-RF07 agrega por día para semana y usa una ventana de siete días', async () => {
  reset();

  await lecturasService.listarAgregado({
    dispositivo: 'DEV-A',
    periodo: 'semana',
    clienteId: 10,
  });

  assert.match(lastQuery().sql, /date_trunc\('day'/);
  assert.match(lastQuery().sql, /INTERVAL '7 days'/);
});

test('CP-RF07 agrega por día para mes y usa una ventana de treinta días', async () => {
  reset();

  await lecturasService.listarAgregado({
    dispositivo: 'DEV-A',
    periodo: 'mes',
    clienteId: 10,
  });

  assert.match(lastQuery().sql, /date_trunc\('day'/);
  assert.match(lastQuery().sql, /INTERVAL '30 days'/);
});

test.todo('CP-RF07 rechaza periodo inválido con error de validación; el servicio actual usa día y siete días por defecto');

test('CP-RF07 CARACTERIZACIÓN: periodo inválido usa día y ventana de siete días', async () => {
  reset();

  await lecturasService.listarAgregado({
    periodo: 'invalido',
    clienteId: 10,
  });

  assert.match(lastQuery().sql, /date_trunc\('day'/);
  assert.match(lastQuery().sql, /INTERVAL '7 days'/);
});

test.todo('CP-RF07 fechaDesde/fechaHasta no se aplican al histórico (defecto conocido, ver matriz RF07)');

test('CP-RF07 CARACTERIZACIÓN: fechaDesde/fechaHasta actualmente se incorporan al SQL del histórico', async () => {
  reset();

  await lecturasService.listarAgregado({
    periodo: 'semana',
    fechaDesde: '2026-10-01',
    fechaHasta: '2026-10-07',
    clienteId: 10,
  });

  assert.match(lastQuery().sql, /l\.timestamp >= \$2::date/);
  assert.match(lastQuery().sql, /l\.timestamp < \(\$3::date \+ INTERVAL '1 day'\)/);
  assert.deepEqual(lastQuery().params, [10, '2026-10-01', '2026-10-07']);
});

test('CP-RF18 lista lecturas aisladas por cliente A y cliente B', async () => {
  reset();

  await lecturasService.listar({ clienteId: 10 });
  const clientAQuery = lastQuery();
  await lecturasService.listar({ clienteId: 20 });
  const clientBQuery = lastQuery();

  assert.match(clientAQuery.sql, /l\.cliente_id = \$1/);
  assert.match(clientBQuery.sql, /l\.cliente_id = \$1/);
  assert.deepEqual(clientAQuery.params, [10]);
  assert.deepEqual(clientBQuery.params, [20]);
});

test('CP-RF18 mantiene aislamiento por cliente en agregación y últimas lecturas', async () => {
  reset();

  await lecturasService.listarAgregado({ periodo: 'mes', clienteId: 10 });
  assert.deepEqual(lastQuery().params, [10]);
  await lecturasService.ultimaPorDispositivo(20);
  assert.deepEqual(lastQuery().params, [20]);
});
