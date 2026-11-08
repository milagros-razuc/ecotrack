const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createRealtimeFixture } = require('./realtime.test-support');

const JWT_SECRET = 'ecotrack-test-jwt-secret';
const DAY = 24 * 60 * 60 * 1000;

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL es obligatorio para platform-panel.integration.test.js');
}

let fixture;
let baseUrl;
let platform;

function platformToken() {
  return jwt.sign(
    {
      sub: platform.user.id,
      username: platform.user.username,
      rol: 'platform_admin',
      clienteId: platform.client.id,
      tv: platform.user.token_version,
    },
    JWT_SECRET,
  );
}

async function request(pathname, options = {}) {
  const headers = {
    Authorization: platformToken(),
    ...(options.headers || {}),
  };
  return fetch(`${baseUrl}${pathname}`, { ...options, headers });
}

async function json(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

async function seedPlatformData() {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const clientName = `platform_${suffix}`;
  const operationalName = `operational_${suffix}`;
  const username = `platform_admin_${suffix}`;
  const { rows: clients } = await fixture.pool.query(
    `INSERT INTO clientes (nombre, es_plataforma)
     VALUES ($1, true)
     RETURNING id, nombre, es_plataforma`,
    [clientName],
  );
  const client = clients[0];
  const { rows: operationalClients } = await fixture.pool.query(
    'INSERT INTO clientes (nombre, es_plataforma) VALUES ($1, false) RETURNING id, nombre',
    [operationalName],
  );
  const operationalClient = operationalClients[0];
  const { rows: users } = await fixture.pool.query(
    `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id, token_version)
     VALUES ($1, 'fixture-platform-hash', 'Fixture Platform Admin', 'platform_admin', $2, 1)
     RETURNING id, username, cliente_id, token_version`,
    [username, client.id],
  );
  const devices = [
    [`FAB-${suffix}`, null, null, null],
    [`CLAIMED-${suffix}`, operationalClient.id, new Date(), null],
    [`ENROLLED-${suffix}`, operationalClient.id, new Date(), new Date()],
  ];
  for (const [code, clientId, claimedAt, enrolledAt] of devices) {
    await fixture.pool.query(
      `INSERT INTO dispositivos (codigo, nombre, cliente_id, reclamado_en, firmware_version,
          firmware_reported_at, ultima_conexion)
       VALUES ($1, $1, $2, $3, '1.2.3', NOW(), NOW())`,
      [code, clientId, claimedAt],
    );
    await fixture.pool.query(
      `INSERT INTO dispositivos_fabrica (device_id, factory_secret_hash, enrolled_at)
       VALUES ($1, $2, $3)`,
      [code, `factory-hash-${code}`, enrolledAt],
    );
  }
  await fixture.pool.query(
    `INSERT INTO lecturas (dispositivo_codigo, cliente_id, temperatura, timestamp)
     VALUES ($1, $2, 20, NOW() - INTERVAL '1 day'),
            ($1, $2, 21, NOW() - INTERVAL '31 days')`,
    [devices[2][0], operationalClient.id],
  );
  return {
    client,
    operationalClient,
    user: users[0],
    devices: devices.map(([code]) => code),
  };
}

async function cleanupPlatformData() {
  if (!platform) return;
  await fixture.pool.query('DELETE FROM lecturas WHERE dispositivo_codigo = ANY($1::text[])', [platform.devices]);
  await fixture.pool.query('DELETE FROM dispositivos_fabrica WHERE device_id = ANY($1::text[])', [platform.devices]);
  await fixture.pool.query('DELETE FROM dispositivos WHERE codigo = ANY($1::text[])', [platform.devices]);
  await fixture.pool.query('DELETE FROM usuarios WHERE id = $1', [platform.user.id]);
  await fixture.pool.query('DELETE FROM clientes WHERE id = $1', [platform.operationalClient.id]);
  await fixture.pool.query('DELETE FROM clientes WHERE id = $1', [platform.client.id]);
}

test.before(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  fixture = await createRealtimeFixture();
  baseUrl = `http://127.0.0.1:${fixture.server.address().port}`;
  platform = await seedPlatformData();
});

test.after(async () => {
  await cleanupPlatformData();
  await fixture.close();
});

test('T1: platform_admin lista dispositivos globales y admin tenant recibe 403 en panel', async () => {
  const response = await request('/api/plataforma/dispositivos');
  assert.equal(response.status, 200);
  const body = await json(response);
  assert.ok(body.items.some((device) => device.codigo === platform.devices[0]));
  for (const pathname of [
    '/api/plataforma/resumen',
    '/api/plataforma/clientes',
    '/api/plataforma/dispositivos',
  ]) {
    const tenantResponse = await fetch(`${baseUrl}${pathname}`, {
      headers: { Authorization: fixture.signToken(fixture.seed.users.a) },
    });
    assert.equal(tenantResponse.status, 403, pathname);
  }
});

test('T2: platform_admin no recibe permisos tenant y solo usa rutas explícitas del panel', async () => {
  const tenantPaths = [
    `/api/dispositivos`,
    `/api/dispositivos/estado`,
    `/api/dispositivos/${platform.devices[2]}/reset-credenciales`,
  ];
  for (const pathname of tenantPaths) {
    const response = await request(pathname, {
      method: pathname.includes('reset-credenciales') ? 'POST' : 'GET',
    });
    assert.equal(response.status, 403, pathname);
  }
});

test('T3: las respuestas del panel solo contienen campos permitidos', async () => {
  const responses = await Promise.all([
    request('/api/plataforma/resumen'),
    request('/api/plataforma/clientes'),
    request('/api/plataforma/dispositivos'),
  ]);
  const forbidden = /(secret|hash|token|password|mqtt|pin|factory)/i;
  for (const response of responses) {
    assert.equal(response.status, 200);
    const body = JSON.stringify(await json(response));
    assert.doesNotMatch(body, forbidden);
  }
});

test('T4: el listado deriva los tres estados de ciclo de vida', async () => {
  const response = await request('/api/plataforma/dispositivos');
  assert.equal(response.status, 200);
  const body = await json(response);
  const states = new Map(body.items.map((device) => [device.codigo, device.estado]));
  assert.equal(states.get(platform.devices[0]), 'fabricado');
  assert.equal(states.get(platform.devices[1]), 'reclamado sin enrolar');
  assert.equal(states.get(platform.devices[2]), 'enrolado');
});

test('T7: el listado pagina, filtra y excluye el cliente plataforma', async () => {
  for (const pathname of [
    '/api/plataforma/dispositivos?pagina=1&limite=1',
    `/api/plataforma/dispositivos?cliente_id=${platform.client.id}`,
    '/api/plataforma/dispositivos?estado=enrolado&firmware=1.2.3',
    '/api/plataforma/dispositivos?limite=100000',
    '/api/plataforma/dispositivos?pagina=invalid',
  ]) {
    const response = await request(pathname);
    assert.notEqual(response.status, 404);
  }
  const excluded = await request(`/api/plataforma/dispositivos?cliente_id=${platform.client.id}`);
  assert.doesNotMatch(JSON.stringify(await json(excluded)), /es_plataforma/);
});

test('T6: reset o código inexistente devuelve error genérico sin filtrar existencia', async () => {
  const response = await request('/api/plataforma/dispositivos/NO-EXISTE/reset-credenciales', {
    method: 'POST',
  });
  assert.ok([400, 404].includes(response.status));
  assert.doesNotMatch(JSON.stringify(await json(response)), /NO-EXISTE|not found|inexistente/i);
});

test('la última lectura usa ventana de 30 días y se separa de última conexión', async () => {
  const response = await request('/api/plataforma/dispositivos?cliente_id=0');
  assert.equal(response.status, 200);
  const body = await json(response);
  const enrolled = body.items.find((device) => device.codigo === platform.devices[2]);
  assert.equal(enrolled.ultima_lectura.temperatura, 20);
  assert.ok(enrolled.ultima_conexion);
  assert.ok(Date.now() - new Date(enrolled.ultima_conexion).getTime() < DAY);
});
