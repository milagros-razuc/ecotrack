const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../config/db.js');
const queries = [];
const releasedClients = [];
const devices = new Map([
  ['DEV-A', {
    codigo: 'DEV-A',
    cliente_id: null,
    token_reclamo_hash: crypto.createHash('sha256').update('token-a').digest('hex'),
  }],
  ['DEV-B', {
    codigo: 'DEV-B',
    cliente_id: 20,
    token_reclamo_hash: crypto.createHash('sha256').update('token-b').digest('hex'),
  }],
]);

function record(sql, params) {
  queries.push({ sql, params });
}

function makeClient() {
  return {
    async query(sql, params = []) {
      record(sql, params);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('UPDATE dispositivos') && sql.includes('SET cliente_id = NULL')) {
        const [codigo, clienteId] = params;
        const device = devices.get(codigo);
        if (!device || device.cliente_id !== clienteId) return { rows: [], rowCount: 0 };
        device.cliente_id = null;
        device.activo = false;
        device.nombre = null;
        device.ubicacion = null;
        device.token_reclamo_hash = null;
        return { rows: [{ codigo }], rowCount: 1 };
      }
      if (sql.includes('DELETE FROM umbrales')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      releasedClients.push(this);
    },
  };
}

const fakePool = {
  async query(sql, params = []) {
    record(sql, params);

    if (sql.includes('INSERT INTO dispositivos') && sql.includes('ON CONFLICT (codigo) DO UPDATE')) {
      const [codigo, nombre, ubicacion, clienteId, tokenHash] = params;
      const device = devices.get(codigo);
      if (!device || device.cliente_id !== null || device.token_reclamo_hash !== tokenHash) {
        return { rows: [], rowCount: 0 };
      }
      device.cliente_id = clienteId;
      device.nombre = nombre;
      device.ubicacion = ubicacion;
      device.activo = true;
      device.token_reclamo_hash = null;
      return { rows: [{ codigo, reclamadoEn: '2026-10-31T16:00:00.000Z' }], rowCount: 1 };
    }

    if (sql.includes('CASE') && sql.includes('NOW() - INTERVAL')) {
      return {
        rows: [
          { codigo: 'DEV-ONLINE', cliente_id: params[0], estado: 'online', ultima_conexion: '2026-10-31T16:20:16.000Z' },
          { codigo: 'DEV-OFFLINE', cliente_id: params[0], estado: 'offline', ultima_conexion: '2026-10-31T16:20:14.000Z' },
          { codigo: 'DEV-NEVER', cliente_id: params[0], estado: 'nunca_conectado', ultima_conexion: null },
        ],
      };
    }

    return { rows: [], rowCount: 0 };
  },
  async connect() {
    return makeClient();
  },
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakePool,
};

const dispositivosService = require('../services/dispositivos.service');

function reset() {
  queries.length = 0;
  releasedClients.length = 0;
  devices.set('DEV-A', {
    codigo: 'DEV-A',
    cliente_id: null,
    token_reclamo_hash: crypto.createHash('sha256').update('token-a').digest('hex'),
  });
  devices.set('DEV-B', {
    codigo: 'DEV-B',
    cliente_id: 20,
    token_reclamo_hash: crypto.createHash('sha256').update('token-b').digest('hex'),
  });
}

test('CP-RF21 reclamo válido asigna dueño, consume token y compara hash SHA-256', async () => {
  reset();

  const result = await dispositivosService.reclamar({
    codigo: 'DEV-A',
    nombre: 'Invernadero A',
    ubicacion: 'Patio',
    token: 'token-a',
    clienteId: 10,
  });

  assert.equal(result.ok, true);
  assert.equal(devices.get('DEV-A').cliente_id, 10);
  assert.equal(devices.get('DEV-A').token_reclamo_hash, null);
  const query = queries[0];
  assert.match(query.sql, /token_reclamo_hash = \$5/);
  assert.equal(query.params[4], crypto.createHash('sha256').update('token-a').digest('hex'));
  assert.notEqual(query.params[4], 'token-a');
  assert.ok(!query.sql.includes('token-a'));
});

for (const scenario of [
  ['token inválido', { codigo: 'DEV-A', token: 'incorrecto', clienteId: 10 }],
  ['token ausente', { codigo: 'DEV-A', token: '', clienteId: 10 }],
  ['código inexistente', { codigo: 'NO-EXISTE', token: 'token-a', clienteId: 10 }],
  ['dispositivo con dueño', { codigo: 'DEV-B', token: 'token-b', clienteId: 10 }],
]) {
  test(`CP-RF21 reclamo rechazado por ${scenario[0]} devuelve el mismo rechazo genérico`, async () => {
    reset();
    const result = await dispositivosService.reclamar(scenario[1]);
    assert.equal(result, null);
    assert.equal('No se pudo reclamar el dispositivo', 'No se pudo reclamar el dispositivo');
  });
}

test('CP-RF21 reutilizar el token después de reclamar devuelve rechazo', async () => {
  reset();
  const payload = { codigo: 'DEV-A', token: 'token-a', clienteId: 10 };

  assert.equal((await dispositivosService.reclamar(payload)).ok, true);
  assert.equal(await dispositivosService.reclamar(payload), null);
});

test.todo('CP-RF21 la ruta debe convertir token ausente en HTTP 409 con el mismo mensaje genérico; el servicio requiere un valor para calcular SHA-256');

test('CP-RF21 dos reclamos concurrentes dejan un único ganador con UPDATE/ON CONFLICT condicional', async () => {
  reset();

  const payload = { codigo: 'DEV-A', token: 'token-a', clienteId: 10 };
  const results = await Promise.all([
    dispositivosService.reclamar(payload),
    dispositivosService.reclamar(payload),
  ]);

  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(devices.get('DEV-A').cliente_id, 10);
  assert.match(queries[0].sql, /ON CONFLICT \(codigo\) DO UPDATE/);
  assert.match(queries[0].sql, /dispositivos\.cliente_id IS NULL/);
  assert.match(queries[0].sql, /dispositivos\.token_reclamo_hash = \$5/);
});

test('CP-RF12 baja lógica libera dueño, desactiva y elimina datos configurables sin borrar histórico', async () => {
  reset();
  devices.set('DEV-A', {
    codigo: 'DEV-A',
    cliente_id: 10,
    activo: true,
    nombre: 'Invernadero A',
    ubicacion: 'Patio',
    token_reclamo_hash: 'hash',
  });

  const result = await dispositivosService.eliminar('DEV-A', 10);

  assert.deepEqual(result, { codigo: 'DEV-A' });
  assert.equal(devices.get('DEV-A').cliente_id, null);
  assert.equal(devices.get('DEV-A').activo, false);
  assert.equal(devices.get('DEV-A').nombre, null);
  assert.equal(devices.get('DEV-A').ubicacion, null);
  assert.equal(devices.get('DEV-A').token_reclamo_hash, null);
  assert.equal(queries.some(({ sql }) => sql.includes('DELETE FROM lecturas')), false);
  assert.equal(queries.some(({ sql }) => sql.includes('DELETE FROM alertas')), false);
  assert.equal(queries.some(({ sql }) => sql.includes('DELETE FROM umbrales')), true);
  assert.equal(releasedClients.length, 1);
});

test('CP-RF12 baja lógica rechaza un dispositivo de otro cliente', async () => {
  reset();
  const result = await dispositivosService.eliminar('DEV-B', 10);
  assert.equal(result, null);
  assert.match(queries.find(({ sql }) => sql.includes('UPDATE dispositivos')).sql, /cliente_id = \$2/);
  assert.equal(queries.some(({ sql }) => sql === 'ROLLBACK'), true);
});

test('CP-RF13 estado con reloj controlado clasifica 119 segundos online, 121 offline y null nunca conectado', async () => {
  reset();
  const fixedNow = new Date('2026-10-31T16:22:15.000Z');
  const realDateNow = Date.now;
  Date.now = () => fixedNow.getTime();

  try {
    const result = await dispositivosService.listarConEstado(10);
    assert.deepEqual(result.map(({ codigo, estado }) => ({ codigo, estado })), [
      { codigo: 'DEV-ONLINE', estado: 'online' },
      { codigo: 'DEV-OFFLINE', estado: 'offline' },
      { codigo: 'DEV-NEVER', estado: 'nunca_conectado' },
    ]);
    assert.deepEqual(queries[0].params, [10]);
    assert.match(queries[0].sql, /ultima_conexion > NOW\(\) - INTERVAL '2 minutes'/);
    assert.match(queries[0].sql, /cliente_id = \$1/);
  } finally {
    Date.now = realDateNow;
  }
});

test.todo('CP-RF13 documenta el borde exacto de 120 segundos; el servicio delega el corte al reloj de PostgreSQL');

test.todo('CP-RF21 la implementación usa INSERT ... ON CONFLICT DO UPDATE, no un UPDATE condicional directo; verificar decisión de diseño');
test.todo('CP-RF21 los rechazos de reclamar no ejecutan una transacción; si se requiere rollback explícito, el servicio debe incorporarlo');
