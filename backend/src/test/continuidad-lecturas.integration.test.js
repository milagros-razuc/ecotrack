const assert = require('assert');
const crypto = require('crypto');
const test = require('node:test');
const { io } = require('socket.io-client');
const { createRealtimeFixture } = require('./realtime.test-support');

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL es obligatorio para ejecutar continuidad-lecturas.integration.test.js');
}

const READING = { temperatura: 23.4, humedad: 47, luminosidad: 65 };
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

let fixture;
let baseUrl;
let receivedAt;
let apiKey;
let apiKeyName;
let processReading;

function topic(deviceCode) {
  return `ecotrack/${deviceCode}/lecturas`;
}

function unix(date) {
  return Math.floor(date.getTime() / 1000);
}

function payload(overrides = {}) {
  return { ...READING, ...overrides };
}

async function send(data, deviceCode = fixture.seed.devices.a, at = receivedAt) {
  return processReading(fixture.io, topic(deviceCode), JSON.stringify(data), at);
}

async function readings(deviceCode = fixture.seed.devices.a) {
  const { rows } = await fixture.pool.query(
    `SELECT * FROM lecturas
     WHERE dispositivo_codigo = $1
     ORDER BY timestamp ASC`,
    [deviceCode]
  );
  return rows;
}

async function alerts(deviceCode = fixture.seed.devices.a) {
  const { rows } = await fixture.pool.query(
    'SELECT * FROM alertas WHERE dispositivo_codigo = $1 ORDER BY id ASC',
    [deviceCode]
  );
  return rows;
}

async function device(deviceCode = fixture.seed.devices.a) {
  const { rows } = await fixture.pool.query(
    'SELECT * FROM dispositivos WHERE codigo = $1',
    [deviceCode]
  );
  return rows[0];
}

async function waitGrace() {
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function connectSocket() {
  const socket = io(baseUrl, {
    auth: { token: fixture.signToken(fixture.seed.users.a) },
    reconnection: false,
  });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

test.before(async () => {
  fixture = await createRealtimeFixture();
  processReading = require('../mqtt/client').procesarMensaje;
  baseUrl = `http://127.0.0.1:${fixture.server.address().port}`;
  receivedAt = new Date('2026-10-28T22:00:00.000Z');
  await fixture.pool.query(
    `UPDATE dispositivos
     SET reclamado_en = $2, activo = true
     WHERE codigo = $1`,
    [fixture.seed.devices.a, new Date(receivedAt.getTime() - 2 * DAY)]
  );
});

test.after(async () => {
  if (apiKeyName) {
    await fixture.pool.query('DELETE FROM api_keys WHERE nombre = $1', [apiKeyName]);
  }
  await fixture.close();
});

test.beforeEach(async () => {
  await fixture.pool.query('DELETE FROM alertas WHERE dispositivo_codigo = $1', [fixture.seed.devices.a]);
  await fixture.pool.query('DELETE FROM lecturas WHERE dispositivo_codigo = ANY($1::text[])', [
    [fixture.seed.devices.a, fixture.seed.devices.unassigned],
  ]);
  await fixture.pool.query('DELETE FROM umbrales WHERE dispositivo_codigo = $1', [fixture.seed.devices.a]);
  await fixture.pool.query(
    `UPDATE dispositivos
     SET ultima_conexion = $2, reclamado_en = $3, activo = true
     WHERE codigo = $1`,
    [
      fixture.seed.devices.a,
      receivedAt,
      new Date(receivedAt.getTime() - 2 * DAY),
    ]
  );
});

test('ts válido se almacena como fecha de captura', async () => {
  const captureAt = new Date(receivedAt.getTime() - 10 * MINUTE);
  await send(payload({ ts: unix(captureAt) }));
  const rows = await readings();
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(new Date(rows[0].timestamp).getTime(), captureAt.getTime());
});

test('ts futuro mayor de un minuto, anterior a 24 horas y tipos inválidos se rechazan', async () => {
  for (const ts of [
    unix(new Date(receivedAt.getTime() + 61 * 1000)),
    unix(new Date(receivedAt.getTime() - DAY - 1000)),
    '1767225600',
    1767225600.5,
    -1,
  ]) {
    await send(payload({ ts }));
  }
  assert.strictEqual((await readings()).length, 0);
});

test('los límites de ts de un minuto futuro y 24 horas pasadas son inclusivos', async () => {
  await send(payload({ ts: unix(new Date(receivedAt.getTime() + MINUTE)) }));
  await send(payload({ ts: unix(new Date(receivedAt.getTime() - DAY)) }));
  assert.strictEqual((await readings()).length, 2);
});

test('ts anterior a reclamado_en se descarta sin efectos ni actividad', async () => {
  const before = await device();
  const oldCapture = new Date(new Date(before.reclamado_en).getTime() - 1000);
  await send(payload({ ts: unix(oldCapture) }));
  const after = await device();
  assert.strictEqual((await readings()).length, 0);
  assert.strictEqual((await alerts()).length, 0);
  assert.strictEqual(new Date(after.ultima_conexion).getTime(), new Date(before.ultima_conexion).getTime());
});

test('atraso de cinco minutos conserva efectos y mayor de cinco minutos los omite', async () => {
  await fixture.pool.query(
    `INSERT INTO umbrales
      (dispositivo_codigo, variable, umbral_min, umbral_max, notificaciones_activas)
     VALUES ($1, 'temperatura', 0, 20, true)
     ON CONFLICT (dispositivo_codigo, variable)
     DO UPDATE SET umbral_min = 0, umbral_max = 20, notificaciones_activas = true`,
    [fixture.seed.devices.a]
  );
  const socket = await connectSocket();
  const events = [];
  socket.on('lectura', (event) => events.push(event));
  await send(payload({ temperatura: 23.4, ts: unix(new Date(receivedAt.getTime() - 5 * MINUTE)) }));
  await send(payload({ temperatura: 23.4, ts: unix(new Date(receivedAt.getTime() - 5 * MINUTE - 1000)) }));
  await waitGrace();
  socket.close();
  assert.strictEqual((await readings()).length, 2);
  assert.strictEqual((await alerts()).length, 1);
  assert.strictEqual(events.length, 1);
});

test('payload sin ts usa la hora de recepción', async () => {
  await send(payload());
  const rows = await readings();
  assert.strictEqual(rows.length, 1);
  assert.ok(Math.abs(new Date(rows[0].timestamp).getTime() - receivedAt.getTime()) < 1000);
});

test('ultima_conexion usa recepción y no ts', async () => {
  const captureAt = new Date(receivedAt.getTime() - 10 * MINUTE);
  await send(payload({ ts: unix(captureAt) }));
  const current = await device();
  assert.ok(Math.abs(new Date(current.ultima_conexion).getTime() - receivedAt.getTime()) < 1000);
  assert.notStrictEqual(new Date(current.ultima_conexion).getTime(), captureAt.getTime());
});

test('ultima lectura no es reemplazada por una diferida', async () => {
  await send(payload({ ts: unix(receivedAt) }));
  await send(payload({ temperatura: 18, ts: unix(new Date(receivedAt.getTime() - 10 * MINUTE)) }));
  const result = await fixture.pool.query(
    `SELECT * FROM lecturas
     WHERE cliente_id = $1 AND dispositivo_codigo = $2
     ORDER BY timestamp DESC LIMIT 1`,
    [fixture.seed.clients.a.id, fixture.seed.devices.a]
  );
  assert.strictEqual(Number(result.rows[0].temperatura), 23.4);
});

test('listado y agregado usan timestamp de captura', async () => {
  await send(payload({ ts: unix(new Date(receivedAt.getTime() - 10 * MINUTE)) }));
  const rows = await readings();
  assert.strictEqual(new Date(rows[0].timestamp).getTime(), receivedAt.getTime() - 10 * MINUTE);
  const aggregate = await fixture.pool.query(
    `SELECT date_trunc('hour', timestamp) AS periodo, COUNT(*)::int AS cantidad
     FROM lecturas
     WHERE cliente_id = $1 AND dispositivo_codigo = $2
     GROUP BY periodo`,
    [fixture.seed.clients.a.id, fixture.seed.devices.a]
  );
  assert.strictEqual(aggregate.rows.length, 1);
});

test('API pública devuelve lecturas del cliente por timestamp', async () => {
  apiKeyName = `continuidad-${Date.now()}`;
  apiKey = `ecotrack-test-${crypto.randomBytes(16).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
  await fixture.pool.query(
    `INSERT INTO api_keys (cliente_id, nombre, clave_hash, prefijo)
     VALUES ($1, $2, $3, $4)`,
    [fixture.seed.clients.a.id, apiKeyName, hash, apiKey.slice(0, 12)]
  );
  await send(payload({ ts: unix(new Date(receivedAt.getTime() - 10 * MINUTE)) }));
  const response = await fetch(`${baseUrl}/api/public/lecturas?dispositivo=${fixture.seed.devices.a}`, {
    headers: { 'X-Api-Key': apiKey },
  });
  assert.strictEqual(response.status, 200);
  const body = await response.json();
  assert.strictEqual(body.length, 1);
  assert.ok(body[0].timestamp);
});

test('lectura diferida del mes anterior cae en su partición y agregado de captura', async () => {
  const reception = new Date(Date.UTC(
    receivedAt.getUTCFullYear(),
    receivedAt.getUTCMonth(),
    1,
    0,
    30,
  ));
  const captureAt = new Date(Date.UTC(
    reception.getUTCFullYear(),
    reception.getUTCMonth(),
    0,
    23,
    50,
  ));
  await fixture.pool.query(
    `UPDATE dispositivos
     SET reclamado_en = $2
     WHERE codigo = $1`,
    [fixture.seed.devices.a, new Date(captureAt.getTime() - MINUTE)]
  );
  await send(payload({ ts: unix(captureAt) }), fixture.seed.devices.a, reception);
  const result = await fixture.pool.query(
    `SELECT tableoid::regclass::text AS partition_name, timestamp
     FROM lecturas
     WHERE dispositivo_codigo = $1`,
    [fixture.seed.devices.a]
  );
  assert.strictEqual(result.rows.length, 1);
  const expectedPartition = `lecturas_${captureAt.getUTCFullYear()}_${String(captureAt.getUTCMonth() + 1).padStart(2, '0')}`;
  assert.strictEqual(result.rows[0].partition_name, expectedPartition);
});

test('dispositivo sin propietario mantiene el descarte existente', async () => {
  await send(payload({ ts: unix(receivedAt) }), fixture.seed.devices.unassigned);
  const result = await fixture.pool.query(
    'SELECT COUNT(*)::int AS cantidad FROM lecturas WHERE dispositivo_codigo = $1',
    [fixture.seed.devices.unassigned]
  );
  assert.strictEqual(result.rows[0].cantidad, 0);
});
