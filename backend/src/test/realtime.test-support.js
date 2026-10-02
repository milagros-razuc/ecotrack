const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const TEST_JWT_SECRET = 'ecotrack-test-jwt-secret';

function testDatabaseConfig() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL es obligatorio y debe apuntar a una base PostgreSQL de pruebas separada');
  }

  let testUrl;
  try {
    testUrl = new URL(connectionString);
  } catch (err) {
    throw new Error('TEST_DATABASE_URL debe ser una URL PostgreSQL valida');
  }

  const developmentUrl = process.env.DATABASE_URL;
  const developmentDatabase = process.env.DB_NAME;
  const testDatabase = decodeURIComponent(testUrl.pathname.slice(1));
  if (!testDatabase.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en _test');
  }
  if (connectionString === developmentUrl || testDatabase === developmentDatabase) {
    throw new Error('TEST_DATABASE_URL debe apuntar a una base distinta de la base de desarrollo');
  }

  return { connectionString, testUrl, testDatabase };
}

async function seedDatabase(pool) {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const clientAName = `realtime_a_${suffix}`;
  const clientBName = `realtime_b_${suffix}`;
  const userAName = `realtime_user_a_${suffix}`;
  const userBName = `realtime_user_b_${suffix}`;
  const deviceA = `REALTIME-A-${suffix}`;
  const deviceB = `REALTIME-B-${suffix}`;
  const deviceUnassigned = `REALTIME-NULL-${suffix}`;

  const { rows: clients } = await pool.query(
    'INSERT INTO clientes (nombre) VALUES ($1), ($2) RETURNING id, nombre',
    [clientAName, clientBName]
  );
  const clientA = clients.find((client) => client.nombre === clientAName);
  const clientB = clients.find((client) => client.nombre === clientBName);

  const { rows: users } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id, token_version)
     VALUES ($1, $2, 'Realtime A', 'admin', $3, 1),
               ($4, $2, 'Realtime B', 'admin', $5, 1)
     RETURNING id, username, cliente_id, token_version`,
            [userAName, 'fixture-password-hash', clientA.id, userBName, clientB.id]
  );

  await pool.query(
    `INSERT INTO dispositivos (codigo, nombre, ubicacion, activo, cliente_id)
     VALUES ($1, $1, 'Test A', true, $2),
            ($3, $3, 'Test B', true, $4),
            ($5, $5, 'Sin asignar', true, NULL)`,
    [deviceA, clientA.id, deviceB, clientB.id, deviceUnassigned]
  );

  return {
    clients: { a: clientA, b: clientB },
    users: {
      a: users.find((user) => user.username === userAName),
      b: users.find((user) => user.username === userBName),
    },
    devices: { a: deviceA, b: deviceB, unassigned: deviceUnassigned },
  };
}

async function cleanupDatabase(pool, seed) {
  const deviceCodes = [seed.devices.a, seed.devices.b, seed.devices.unassigned];
  await pool.query('DELETE FROM lecturas WHERE dispositivo_codigo = ANY($1::text[])', [deviceCodes]);
  await pool.query('DELETE FROM alertas WHERE dispositivo_codigo = ANY($1::text[])', [deviceCodes]);
  await pool.query('DELETE FROM umbrales WHERE dispositivo_codigo = ANY($1::text[])', [deviceCodes]);
  await pool.query('DELETE FROM dispositivos WHERE codigo = ANY($1::text[])', [deviceCodes]);
  await pool.query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [[seed.users.a.id, seed.users.b.id]]);
  await pool.query('DELETE FROM clientes WHERE id = ANY($1::int[])', [[seed.clients.a.id, seed.clients.b.id]]);
}

function signToken(user, options = {}) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      rol: 'admin',
      clienteId: user.cliente_id,
      tv: user.token_version,
    },
    TEST_JWT_SECRET,
    options
  );
}

async function createRealtimeFixture() {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  const database = testDatabaseConfig();
  process.env.DB_HOST = database.testUrl.hostname;
  process.env.DB_PORT = database.testUrl.port || '5432';
  process.env.DB_NAME = database.testDatabase;
  process.env.DB_USER = decodeURIComponent(database.testUrl.username);
  process.env.DB_PASS = decodeURIComponent(database.testUrl.password);

  const pool = new Pool({ connectionString: database.connectionString });
  const { iniciar } = require('../../index');
  const { procesarMensaje } = require('../mqtt/client');
  const instance = await iniciar({ port: 0, inicializarBase: true, iniciarMqtt: false });
  const seed = await seedDatabase(pool);

  async function close() {
    try {
      await cleanupDatabase(pool, seed);
    } finally {
      await new Promise((resolve) => instance.io.close(resolve));
      await pool.end();
      await require('../config/db').end();
    }
  }

  return {
    ...instance,
    pool,
    seed,
    signToken,
    procesarMensaje: (topic, payload) => procesarMensaje(instance.io, topic, payload),
    close,
  };
}

module.exports = { createRealtimeFixture, signToken, TEST_JWT_SECRET };
