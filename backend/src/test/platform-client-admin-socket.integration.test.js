const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const test = require('node:test');
const { io } = require('socket.io-client');
const { createRealtimeFixture } = require('./realtime.test-support');

const JWT_SECRET = 'ecotrack-test-jwt-secret';
const EVENT_NAME = 'platform:cliente-creado';

let fixture;
let baseUrl;
let platformToken;
let tenantToken;
let queryPool;
let resetClientAdminRateLimit;

function tokenFor(user, role = user.rol) {
  return jwt.sign({
    sub: user.id,
    username: user.username,
    rol: role,
    clienteId: user.cliente_id,
    tv: user.token_version,
  }, JWT_SECRET);
}

function validBody(suffix) {
  return {
    nombre_cliente: `Socket Client ${suffix}`,
    username: `socket_admin_${suffix}`,
    nombre_admin: 'Socket Admin',
    motivo: 'Socket test',
  };
}

function request(body, token = platformToken) {
  return fetch(`${baseUrl}/api/plataforma/clientes`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function connect(token) {
  return io(baseUrl, { auth: { token }, reconnection: false });
}

function waitForEvent(socket, eventName, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error('no llegó cliente:creado a platform-admins'));
    }, timeout);
    const onEvent = (payload) => {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      resolve(payload);
    };
    socket.on(eventName, onEvent);
  });
}

test.before(async () => {
  fixture = await createRealtimeFixture();
  ({ resetClientAdminRateLimit } = require('../routes/plataforma'));
  const { getActiveRegistry } = require('../realtime/socketRegistry');
  assert.ok(getActiveRegistry());
  baseUrl = `http://127.0.0.1:${fixture.server.address().port}`;
  platformToken = tokenFor(fixture.seed.users.a, 'platform_admin');
  tenantToken = tokenFor(fixture.seed.users.b, 'admin');
  queryPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
  });
});

test.after(async () => {
  resetClientAdminRateLimit();
  await queryPool?.end();
  await fixture?.close();
});

test('el alta emite después del commit solo a platform-admins con payload mínimo', async () => {
  resetClientAdminRateLimit();
  const platformSocket = connect(platformToken);
  const tenantSocket = connect(tenantToken);
  try {
    await Promise.all([once(platformSocket, 'connect'), once(tenantSocket, 'connect')]);
    const tenantEvents = [];
    tenantSocket.on(EVENT_NAME, (payload) => tenantEvents.push(payload));
    assert.notEqual(fixture.seed.users.a.cliente_id, fixture.seed.users.b.cliente_id);
    const event = waitForEvent(platformSocket, EVENT_NAME);
    const response = await request(validBody(Date.now()));
    assert.equal(response.status, 201);
    const payload = await event;

    const { rows } = await queryPool.query(
      'SELECT id, nombre FROM clientes WHERE id = $1',
      [payload.cliente.id],
    );
    assert.deepEqual(rows, [{ id: payload.cliente.id, nombre: payload.cliente.nombre }]);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.deepEqual(tenantEvents, []);

    assert.deepEqual(Object.keys(payload), ['cliente']);
    assert.deepEqual(Object.keys(payload.cliente), ['id', 'nombre']);
    assert.equal(typeof payload.cliente.id, 'number');
    assert.match(payload.cliente.nombre, /^Socket Client /);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'password_temporal'), false);
  } finally {
    platformSocket.close();
    tenantSocket.close();
  }
});

test('un 400 y un 409 no emiten el evento', async () => {
  resetClientAdminRateLimit();
  const platformSocket = connect(platformToken);
  try {
    await once(platformSocket, 'connect');
    const events = [];
    platformSocket.on(EVENT_NAME, (payload) => events.push(payload));
    const preparationEvent = waitForEvent(platformSocket, EVENT_NAME);
    const first = await request(validBody(`conflict_${Date.now()}`));
    assert.equal(first.status, 201);
    const body = await first.json();
    const preparedPayload = await preparationEvent;
    assert.equal(preparedPayload.cliente.id, body.cliente.id);

    const invalid = request({ extra: true });
    assert.equal((await invalid).status, 400);

    const duplicate = await request({
      ...validBody(`other_${Date.now()}`),
      username: body.usuario.username,
    });
    assert.equal(duplicate.status, 409);
    const duplicateName = await request({
      ...validBody(`another_${Date.now()}`),
      nombre_cliente: body.cliente.nombre.toUpperCase(),
    });
    assert.equal(duplicateName.status, 409);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(events.length, 1);
    assert.equal(events[0].cliente.id, body.cliente.id);
  } finally {
    platformSocket.close();
  }
});

test('si falla el emit, el alta conserva el commit y responde 201', async () => {
  resetClientAdminRateLimit();
  const socketRegistry = require('../realtime/socketRegistry');
  const registry = socketRegistry.getActiveRegistry();
  const originalEmit = registry.emitToPlatformAdmins;
  const originalConsoleError = console.error;
  const emitCalls = [];
  const errorLogs = [];
  console.error = (...args) => errorLogs.push(args);
  registry.emitToPlatformAdmins = (...args) => {
    emitCalls.push(args);
    throw new Error('emit falló');
  };
  try {
    const response = await request(validBody(`emit-failure_${Date.now()}`));
    assert.equal(response.status, 201);
    const body = await response.json();
    const { rows } = await queryPool.query(
      `SELECT
         (SELECT COUNT(*) FROM clientes WHERE id = $1)::int AS clientes,
         (SELECT COUNT(*) FROM usuarios WHERE id = $2)::int AS usuarios,
         (SELECT COUNT(*) FROM auditoria WHERE accion = 'crear_cliente' AND entidad_id = $1::text)::int AS auditoria`,
      [body.cliente.id, body.usuario.id],
    );
    assert.deepEqual(rows, [{ clientes: 1, usuarios: 1, auditoria: 1 }]);
    assert.equal(emitCalls.length, 1);
    assert.deepEqual(errorLogs, [['emit falló']]);
    assert.equal(errorLogs[0].length, 1);
  } finally {
    console.error = originalConsoleError;
    registry.emitToPlatformAdmins = originalEmit;
  }
});
