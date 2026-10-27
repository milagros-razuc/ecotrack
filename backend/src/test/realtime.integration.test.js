const assert = require('assert');
const bcrypt = require('bcryptjs');
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

function waitFor(predicate, timeout = 2000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() - startedAt >= timeout) {
        return reject(new Error('Condicion no cumplida dentro del tiempo limite'));
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

function closeAll(...sockets) {
  sockets.forEach((socket) => socket.close());
}

async function createTempUser(rol) {
  const { rows } = await fixture.pool.query(
    `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id, token_version)
     VALUES ($1, 'fixture-password-hash', 'Temp', $2, $3, 1)
     RETURNING id, username, cliente_id, token_version`,
    [`realtime_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, rol, fixture.seed.clients.a.id]
  );
  return rows[0];
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

test('US1: una alerta de dispositivo sin cliente no se guarda ni se emite', async () => {
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

    assert.strictEqual(Number(after.rows[0].count), Number(before.rows[0].count));
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

test('US1: un token sin clienteId solo se une a su room de usuario', async () => {
  const user = fixture.seed.users.a;
  const token = jwt.sign(
    { sub: user.id, username: user.username, rol: 'admin', tv: user.token_version },
    TEST_JWT_SECRET
  );
  const socket = connectWithToken(token);

  try {
    await once(socket, 'connect');
    const serverSocket = fixture.io.sockets.sockets.get(socket.id);
    const rooms = [...serverSocket.rooms];

    assert.ok(rooms.includes(`usuario:${user.id}`));
    assert.strictEqual(rooms.some((room) => room.startsWith('cliente:')), false);
  } finally {
    closeAll(socket);
  }
});

test('US2: el socket se desconecta al expirar el token y limpia su timer', async () => {
  const socket = connectWithToken(fixture.signToken(fixture.seed.users.a, { expiresIn: '1s' }));
  const disconnected = once(socket, 'disconnect');

  try {
    await once(socket, 'connect');
    const [reason] = await disconnected;

    assert.strictEqual(reason, 'io server disconnect');
    assert.strictEqual(fixture.socketRegistry.socketsForUser(fixture.seed.users.a.id).size, 0);
    assert.strictEqual(fixture.socketRegistry.hasExpiryTimer(socket.id), false);
  } finally {
    closeAll(socket);
  }
});

test('US2: desconectar manualmente limpia el timer de exp', async () => {
  const socket = connectWithToken(fixture.signToken(fixture.seed.users.a, { expiresIn: '30s' }));
  const disconnected = once(socket, 'disconnect');

  try {
    await once(socket, 'connect');
    socket.disconnect();
    await disconnected;
    await waitFor(() => fixture.socketRegistry.socketsForUser(fixture.seed.users.a.id).size === 0);

    assert.strictEqual(fixture.socketRegistry.socketsForUser(fixture.seed.users.a.id).size, 0);
    assert.strictEqual(fixture.socketRegistry.hasExpiryTimer(socket.id), false);
  } finally {
    closeAll(socket);
  }
});

test('US2: cambio de contraseña desconecta los sockets del usuario', async () => {
  const passwordSocket = connectWithToken(fixture.signToken(sameClientUser));
  const passwordDisconnected = once(passwordSocket, 'disconnect');

  try {
    await once(passwordSocket, 'connect');
    const passwordHash = await bcrypt.hash('password-anterior', 10);
    await fixture.pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [passwordHash, sameClientUser.id]);
    const authService = require('../services/auth.service');
    await authService.cambiarPassword(sameClientUser.id, 'password-anterior', 'password-nueva');
    await passwordDisconnected;

    assert.strictEqual(fixture.socketRegistry.socketsForUser(sameClientUser.id).size, 0);
  } finally {
    closeAll(passwordSocket);
  }
});

test('US2: eliminar usuario desconecta sus sockets', async () => {
  const usuariosService = require('../services/usuarios.service');
  const target = await createTempUser('comun');
  const socket = connectWithToken(fixture.signToken(target));
  const disconnected = once(socket, 'disconnect');

  try {
    await once(socket, 'connect');
    const deletion = await usuariosService.eliminar(target.id, sameClientUser.id, fixture.seed.clients.a.id);
    await disconnected;

    assert.strictEqual(deletion.ok, true);
    assert.strictEqual(fixture.socketRegistry.socketsForUser(target.id).size, 0);
  } finally {
    closeAll(socket);
  }
});


async function expectRejected(socket) {
  try {
    const [err] = await once(socket, 'connect_error');
    assert.strictEqual(err.data?.code, 'AUTHENTICATION_ERROR');
    assert.strictEqual(socket.connected, false);
  } finally {
    closeAll(socket);
  }
}

test('US2: conexión sin token es rechazada en el handshake', async () => {
  await expectRejected(io(baseUrl, { auth: {}, reconnection: false }));
});

test('US2: token con firma inválida es rechazado en el handshake', async () => {
  const user = fixture.seed.users.a;
  const forged = jwt.sign(
    { sub: user.id, username: user.username, rol: 'admin', clienteId: user.cliente_id, tv: user.token_version },
    'otro-secreto-que-no-es-el-del-servidor'
  );
  await expectRejected(connectWithToken(forged));
});

test('US2: token vencido es rechazado en el handshake', async () => {
  const expired = fixture.signToken(fixture.seed.users.a, { expiresIn: '-10s' });
  await expectRejected(connectWithToken(expired));
});

test('US2: token con tv desactualizado es rechazado en el handshake', async () => {
  const stale = fixture.signToken({ ...sameClientUser, token_version: sameClientUser.token_version + 99 });
  await expectRejected(connectWithToken(stale));
});

test('US3: el clienteId enviado por el navegador se ignora', async () => {
  await seedTemperatureThreshold(fixture.seed.devices.a);
  const clientBId = fixture.seed.clients.b.id;
  const socket = io(baseUrl, {
    auth: { token: fixture.signToken(fixture.seed.users.a), clienteId: clientBId },
    query: { clienteId: String(clientBId) },
    reconnection: false,
  });

  try {
    await once(socket, 'connect');
    const rooms = [...fixture.io.sockets.sockets.get(socket.id).rooms];
    assert.strictEqual(rooms.includes(`cliente:${clientBId}`), false);

    const readings = record(socket, 'lectura');
    await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.b}/lecturas`, reading(24.5));
    await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
    await waitGrace();
    readings.stop();

    assert.strictEqual(readings.events.length, 1);
    assert.strictEqual(readings.events[0].dispositivoCodigo, fixture.seed.devices.a);
  } finally {
    closeAll(socket);
  }
});
test('US2: cambio de rol por un admin desconecta los sockets del usuario', async () => {
  const usuariosService = require('../services/usuarios.service');
  const target = await createTempUser('admin');
  const socket = connectWithToken(fixture.signToken(target));
  const disconnected = once(socket, 'disconnect');

  try {
    await once(socket, 'connect');
    const result = await usuariosService.actualizar(
      target.id,
      { nombre: 'Temp', rol: 'comun' },
      fixture.seed.clients.a.id
    );
    assert.ok(result.usuario, `actualizar falló: ${result.error}`);
    await disconnected;

    assert.strictEqual(fixture.socketRegistry.socketsForUser(target.id).size, 0);
  } finally {
    closeAll(socket);
    await fixture.pool.query('DELETE FROM usuarios WHERE id = $1', [target.id]);
  }
});