const assert = require('assert');
const test = require('node:test');
const { spawnSync } = require('child_process');
const http = require('http');
const { Pool } = require('pg');
const { io } = require('socket.io-client');
const { obtenerOrigenesPermitidos } = require('../config/cors');
const app = require('../app');
const { crearServidor } = require('../../index');

function getTestDatabase() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Configure TEST_DATABASE_URL para ejecutar las pruebas de hardening');
  }

  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database.startsWith('hardening_') && !database.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL debe apuntar a una base hardening_* o *_test');
  }

  return {
    url,
    database,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    host: url.hostname,
    port: url.port || '5432',
  };
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function withTemporaryDatabase(callback) {
  const source = getTestDatabase();
  const database = `hardening_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const adminPool = new Pool({
    host: source.host,
    port: source.port,
    user: source.user,
    password: source.password,
    database: source.database,
  });

  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
  await adminPool.end();

  try {
    return await callback({ ...source, database });
  } finally {
    const cleanupPool = new Pool({
      host: source.host,
      port: source.port,
      user: source.user,
      password: source.password,
      database: source.database,
    });
    try {
      await cleanupPool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [database]
      );
      await cleanupPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)}`);
    } finally {
      await cleanupPool.end();
    }
  }
}

function runMigration(database, options = {}) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    NODE_ENV: options.nodeEnv || 'development',
    DB_HOST: database.host,
    DB_PORT: database.port,
    DB_USER: database.user,
    DB_PASS: database.password,
    DB_NAME: database.database,
  };
  if (options.adminPass !== undefined) env.ADMIN_PASS = options.adminPass;

  return spawnSync(
    process.execPath,
    ['-e', "require('./src/config/migrate')().then(() => require('./src/config/db').end()).catch((error) => { console.error(error.message); process.exitCode = 1; })"],
    {
      cwd: require('path').resolve(__dirname, '../..'),
      env,
      encoding: 'utf8',
    }
  );
}

test('producción exige ADMIN_PASS solo al crear el administrador inicial', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Configure TEST_DATABASE_URL para ejecutar las pruebas de hardening');
    return;
  }

  await withTemporaryDatabase(async (database) => {
    const missingPassword = runMigration(database, { nodeEnv: 'production' });
    assert.notStrictEqual(missingPassword.status, 0);
    assert.match(missingPassword.stderr, /ADMIN_PASS es obligatorio/);

    const emptyPassword = runMigration(database, { nodeEnv: 'production', adminPass: '   ' });
    assert.notStrictEqual(emptyPassword.status, 0);
    assert.match(emptyPassword.stderr, /ADMIN_PASS es obligatorio/);

    const configuredPassword = runMigration(database, {
      nodeEnv: 'production',
      adminPass: 'temporary-production-password',
    });
    assert.strictEqual(configuredPassword.status, 0, configuredPassword.stderr);

    const existingUsers = runMigration(database, { nodeEnv: 'production' });
    assert.strictEqual(existingUsers.status, 0, existingUsers.stderr);
  });
});

test('desarrollo conserva defaults y producción no crea el usuario de prueba', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Configure TEST_DATABASE_URL para ejecutar las pruebas de hardening');
    return;
  }

  await withTemporaryDatabase(async (database) => {
    const development = runMigration(database, { nodeEnv: 'development' });
    assert.strictEqual(development.status, 0, development.stderr);
    assert.match(development.stderr, /ADMIN_PASS no está configurado/);

    const pool = new Pool({
      host: database.host,
      port: database.port,
      user: database.user,
      password: database.password,
      database: database.database,
    });
    try {
      const { rows } = await pool.query(
        "SELECT username FROM usuarios WHERE username IN ('admin', 'operario1') ORDER BY username"
      );
      assert.deepStrictEqual(rows.map((row) => row.username), ['admin', 'operario1']);
    } finally {
      await pool.end();
    }
  });

  await withTemporaryDatabase(async (database) => {
    const production = runMigration(database, {
      nodeEnv: 'production',
      adminPass: 'temporary-production-password',
    });
    assert.strictEqual(production.status, 0, production.stderr);

    const pool = new Pool({
      host: database.host,
      port: database.port,
      user: database.user,
      password: database.password,
      database: database.database,
    });
    try {
      const { rows } = await pool.query(
        "SELECT username FROM usuarios WHERE username = 'operario1'"
      );
      assert.strictEqual(rows.length, 0);
    } finally {
      await pool.end();
    }
  });
});

test('la migración es repetible y protege roles, estados y la FK de alertas', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Configure TEST_DATABASE_URL para ejecutar las pruebas de hardening');
    return;
  }

  await withTemporaryDatabase(async (database) => {
    const migrationOptions = {
      nodeEnv: 'production',
      adminPass: 'temporary-production-password',
    };
    const firstMigration = runMigration(database, migrationOptions);
    assert.strictEqual(firstMigration.status, 0, firstMigration.stderr);
    const secondMigration = runMigration(database, {
      nodeEnv: 'production',
    });
    assert.strictEqual(secondMigration.status, 0, secondMigration.stderr);

    const pool = new Pool({
      host: database.host,
      port: database.port,
      user: database.user,
      password: database.password,
      database: database.database,
    });
    try {
      const { rows: constraints } = await pool.query(`
        SELECT conname
        FROM pg_constraint
        WHERE conname IN ('chk_usuarios_rol', 'chk_alertas_estado', 'fk_alertas_dispositivo')
        ORDER BY conname
      `);
      assert.deepStrictEqual(
        constraints.map((constraint) => constraint.conname),
        ['chk_alertas_estado', 'chk_usuarios_rol', 'fk_alertas_dispositivo']
      );

      const { rows: cliente } = await pool.query(
        "SELECT id FROM clientes WHERE nombre = 'Cliente Principal' LIMIT 1"
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id)
           VALUES ($1, 'test-hash', 'Rol inválido', 'superadmin', $2)`,
          [`invalid-role-${Date.now()}`, cliente[0].id]
        )
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO alertas (dispositivo_codigo, variable, valor, estado)
           VALUES ('ESP32-001', 'temperatura', 20, 'descartada')`
        )
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO alertas (dispositivo_codigo, variable, valor, estado)
           VALUES ('MISSING-DEVICE', 'temperatura', 20, 'pendiente')`
        )
      );
    } finally {
      await pool.end();
    }
  });
});

function requestHealth(origin) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/health',
          headers: { Origin: origin },
        },
        (response) => {
          let body = '';
          response.on('data', (chunk) => { body += chunk; });
          response.on('end', () => {
            server.close(() => resolve({ response, body }));
          });
        }
      );
      request.on('error', (error) => server.close(() => reject(error)));
      request.end();
    });
  });
}

test('CORS normaliza orígenes y preserva clientes sin Origin', async () => {
  assert.deepStrictEqual(
    obtenerOrigenesPermitidos(' https://dashboard.example,https://api.example, https://dashboard.example '),
    ['https://dashboard.example', 'https://api.example']
  );
  assert.deepStrictEqual(obtenerOrigenesPermitidos(''), ['http://localhost:8080']);
  assert.throws(
    () => obtenerOrigenesPermitidos('https://dashboard.example, *'),
    /no puede contener el comodín/
  );

  const allowed = await requestHealth('http://localhost:8080');
  assert.strictEqual(allowed.response.headers['access-control-allow-origin'], 'http://localhost:8080');
  assert.deepStrictEqual(JSON.parse(allowed.body), { ok: true });

  const denied = await requestHealth('https://not-allowed.example');
  assert.strictEqual(denied.response.headers['access-control-allow-origin'], undefined);
});

test('Socket.io comparte CORS y acepta clientes sin Origin', async () => {
  const instance = crearServidor({ iniciarMqtt: false });
  await new Promise((resolve) => instance.server.listen(0, resolve));
  const port = instance.server.address().port;
  const sockets = [
    io(`http://127.0.0.1:${port}`, {
      extraHeaders: { Origin: 'http://localhost:8080' },
      reconnection: false,
    }),
    io(`http://127.0.0.1:${port}`, { reconnection: false }),
  ];

  try {
    const errors = await Promise.all(sockets.map((socket) => new Promise((resolve) => {
      socket.once('connect_error', resolve);
      socket.once('connect', () => resolve(null));
    })));
    assert.ok(errors.every((error) => !error || error.data?.code === 'AUTHENTICATION_ERROR'));
  } finally {
    sockets.forEach((socket) => socket.close());
    await new Promise((resolve) => instance.server.close(resolve));
  }
});

test('Helmet agrega X-Content-Type-Options sin alterar el endpoint de salud', async () => {
  const result = await requestHealth('http://localhost:8080');
  assert.strictEqual(result.response.headers['x-content-type-options'], 'nosniff');
  assert.deepStrictEqual(JSON.parse(result.body), { ok: true });
});
