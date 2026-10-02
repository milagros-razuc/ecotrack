const assert = require('assert');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const { once } = require('events');
const { io } = require('socket.io-client');
const { createRealtimeFixture, TEST_JWT_SECRET } = require('./realtime.test-support');

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL es obligatorio para ejecutar realtime.integration.test.js');
}

let fixture;
let baseUrl;
let sameClientUser;

test.before(async () => {
  fixture = await createRealtimeFixture();
  const { rows } = await fixture.pool.query(
    `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id, token_version)
     VALUES ($1, 'fixture-password-hash', 'Realtime A2', 'admin', $2, 1)
     RETURNING id, username, cliente_id, token_version`,
    [`realtime_user_a2_${Date.now()}`, fixture.seed.clients.a.id]
  );
  sameClientUser = rows[0];
  baseUrl = `http://127.0.0.1:${fixture.server.address().port}`;
});

test.after(async () => {
  if (sameClientUser) {
    await fixture.pool.query('DELETE FROM usuarios WHERE id = $1', [sameClientUser.id]);
  }
  await fixture.close();
});

function connectWithToken(token) {
  return io(baseUrl, { auth: { token }, reconnection: false });
}

async function connectAll(...sockets) {
  await Promise.all(sockets.map((socket) => once(socket, 'connect')));
}

function record(socket, eventName) {
  const events = [];
  const onEvent = (event) => events.push(event);
  socket.on(eventName, onEvent);
  return { events, stop: () => socket.off(eventName, onEvent) };
}

function waitGrace() {
  return new Promise((resolve) => setTimeout(resolve, 300));
}

function closeAll(...sockets) {
  sockets.forEach((socket) => socket.close());
}

function reading(temperature = 23.4) {
  return JSON.stringify({ temperatura: temperature, humedad: 47, luminosidad: 65 });
}

async function seedTemperatureThreshold(deviceCode) {
  await fixture.pool.query(
    `INSERT INTO umbrales (dispositivo_codigo, variable, umbral_min, umbral_max, notificaciones_activas)
     VALUES ($1, 'temperatura', 0, 20, true)
     ON CONFLICT (dispositivo_codigo, variable)
     DO UPDATE SET umbral_min = 0, umbral_max = 20, notificaciones_activas = true`,
    [deviceCode]
  );
}

test('US1: cada cliente recibe solo sus propias lecturas', async () => {
  const clientASocket = connectWithToken(fixture.signToken(fixture.seed.users.a));
  const clientBSocket = connectWithToken(fixture.signToken(fixture.seed.users.b));

  try {
    await connectAll(clientASocket, clientBSocket);
    let clientAReadings = record(clientASocket, 'lectura');
    let clientBReadings = record(clientBSocket, 'lectura');
    await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
    await waitGrace();
    clientAReadings.stop();
    clientBReadings.stop();

    assert.strictEqual(clientAReadings.events.length, 1);
    assert.strictEqual(clientBReadings.events.length, 0);

    clientAReadings = record(clientASocket, 'lectura');
    clientBReadings = record(clientBSocket, 'lectura');
    await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.b}/lecturas`, reading(24.5));
    await waitGrace();
    clientAReadings.stop();
    clientBReadings.stop();

    assert.strictEqual(clientAReadings.events.length, 0);
    assert.strictEqual(clientBReadings.events.length, 1);
  } finally {
    closeAll(clientASocket, clientBSocket);
  }
});

test('US1: dos usuarios del mismo cliente reciben la misma lectura', async () => {
  const firstSocket = connectWithToken(fixture.signToken(fixture.seed.users.a));
  const secondSocket = connectWithToken(fixture.signToken(sameClientUser));

  try {
    await connectAll(firstSocket, secondSocket);
    const firstReadings = record(firstSocket, 'lectura');
    const secondReadings = record(secondSocket, 'lectura');
    await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
    await waitGrace();
    firstReadings.stop();
    secondReadings.stop();

    assert.deepStrictEqual(firstReadings.events, secondReadings.events);
    assert.strictEqual(firstReadings.events.length, 1);
  } finally {
    closeAll(firstSocket, secondSocket);
  }
});

test('US1: un dispositivo sin cliente no emite eventos', async () => {
  const clientASocket = connectWithToken(fixture.signToken(fixture.seed.users.a));
  const clientBSocket = connectWithToken(fixture.signToken(fixture.seed.users.b));

  try {
    await connectAll(clientASocket, clientBSocket);
    const clientAReadings = record(clientASocket, 'lectura');
    const clientBReadings = record(clientBSocket, 'lectura');
    await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.unassigned}/lecturas`, reading());
    await waitGrace();
    clientAReadings.stop();
    clientBReadings.stop();

    assert.strictEqual(clientAReadings.events.length, 0);
    assert.strictEqual(clientBReadings.events.length, 0);
  } finally {
    closeAll(clientASocket, clientBSocket);
  }
});

test('US1: las alertas llegan solo al cliente dueño del dispositivo', async () => {
  await seedTemperatureThreshold(fixture.seed.devices.a);
  const clientASocket = connectWithToken(fixture.signToken(fixture.seed.users.a));
  const clientBSocket = connectWithToken(fixture.signToken(fixture.seed.users.b));

  try {
    await connectAll(clientASocket, clientBSocket);
    const clientAAlerts = record(clientASocket, 'alerta');
    const clientBAlerts = record(clientBSocket, 'alerta');
    await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading(23.4));
    await waitGrace();
    clientAAlerts.stop();
    clientBAlerts.stop();

    assert.strictEqual(clientAAlerts.events.length, 1);
    assert.strictEqual(clientBAlerts.events.length, 0);
    const alert = clientAAlerts.events[0];
    assert.deepStrictEqual(Object.keys(alert).sort(), [
      'dispositivoCodigo',
      'timestamp',
      'umbralMax',
      'umbralMin',
      'valor',
      'variable',
    ].sort());
    assert.strictEqual(alert.dispositivoCodigo, fixture.seed.devices.a);
    assert.strictEqual(alert.variable, 'temperatura');
    assert.strictEqual(Number(alert.valor), 23.4);
    assert.strictEqual(Number(alert.umbralMin), 0);
    assert.strictEqual(Number(alert.umbralMax), 20);
    assert.ok(!Number.isNaN(Date.parse(alert.timestamp)));
  } finally {
    closeAll(clientASocket, clientBSocket);
  }
});

test('US1: dos usuarios del mismo cliente reciben la misma alerta', async () => {
  await seedTemperatureThreshold(fixture.seed.devices.a);
  const firstSocket = connectWithToken(fixture.signToken(fixture.seed.users.a));
  const secondSocket = connectWithToken(fixture.signToken(sameClientUser));

  try {
    await connectAll(firstSocket, secondSocket);
    const firstAlerts = record(firstSocket, 'alerta');
    const secondAlerts = record(secondSocket, 'alerta');
    await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading(23.4));
    await waitGrace();
    firstAlerts.stop();
    secondAlerts.stop();

    assert.strictEqual(firstAlerts.events.length, 1);
    assert.strictEqual(secondAlerts.events.length, 1);
    assert.deepStrictEqual(firstAlerts.events, secondAlerts.events);
  } finally {
    closeAll(firstSocket, secondSocket);
  }
});

test('US1: una alerta de dispositivo sin cliente se guarda pero no se emite', async () => {
  await seedTemperatureThreshold(fixture.seed.devices.unassigned);
  const clientASocket = connectWithToken(fixture.signToken(fixture.seed.users.a));
  const clientBSocket = connectWithToken(fixture.signToken(fixture.seed.users.b));

  try {
    await connectAll(clientASocket, clientBSocket);
    const clientAAlerts = record(clientASocket, 'alerta');
    const clientBAlerts = record(clientBSocket, 'alerta');
    const before = await fixture.pool.query(
      'SELECT COUNT(*) FROM alertas WHERE dispositivo_codigo = $1',
      [fixture.seed.devices.unassigned]
    );
    await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.unassigned}/lecturas`, reading(23.4));
    await waitGrace();
    clientAAlerts.stop();
    clientBAlerts.stop();
    const after = await fixture.pool.query(
      'SELECT COUNT(*) FROM alertas WHERE dispositivo_codigo = $1',
      [fixture.seed.devices.unassigned]
    );

    assert.strictEqual(Number(after.rows[0].count), Number(before.rows[0].count) + 1);
    assert.strictEqual(clientAAlerts.events.length, 0);
    assert.strictEqual(clientBAlerts.events.length, 0);
  } finally {
    closeAll(clientASocket, clientBSocket);
  }
});

test('US1: un token sin clienteId no recibe eventos de ningún cliente', async () => {
  const user = fixture.seed.users.a;
  await seedTemperatureThreshold(fixture.seed.devices.a);
  await seedTemperatureThreshold(fixture.seed.devices.b);
  const token = jwt.sign(
    { sub: user.id, username: user.username, rol: 'admin', tv: user.token_version },
    TEST_JWT_SECRET
  );
  const socket = connectWithToken(token);

  try {
    const outcome = await Promise.race([
      once(socket, 'connect').then(() => 'connected'),
      once(socket, 'connect_error').then(() => 'rejected'),
    ]);

    if (outcome === 'connected') {
      const alerts = record(socket, 'alerta');
      await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
      await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.b}/lecturas`, reading(24.5));
      await waitGrace();
      alerts.stop();
      assert.strictEqual(alerts.events.length, 0);
    }

    assert.ok(outcome === 'connected' || outcome === 'rejected');
  } finally {
    closeAll(socket);
  }
});
