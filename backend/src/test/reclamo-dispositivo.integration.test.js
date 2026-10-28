const assert = require('assert');
const test = require('node:test');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const {
  withTemporaryDatabase,
  assertUnclaimedDevice,
  assertNoThresholds,
} = require('./realtime.test-support');
const TEST_JWT_SECRET = 'ecotrack-test-jwt-secret';

function hashTokenReclamo(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function databaseEnvironment(database) {
  return {
    ...process.env,
    NODE_ENV: 'development',
    DB_HOST: database.host,
    DB_PORT: database.port,
    DB_USER: database.user,
    DB_PASS: database.password,
    DB_NAME: database.database,
  };
}

function migrate(database) {
  return spawnSync(
    process.execPath,
    ['-e', "require('./src/config/migrate')().then(() => require('./src/config/db').end())"],
    {
      cwd: require('path').resolve(__dirname, '../..'),
      env: databaseEnvironment(database),
      encoding: 'utf8',
    }
  );
}

function runProvision(database, args) {
  return spawnSync(
    process.execPath,
    ['scripts/provision-device.js', ...args],
    {
      cwd: require('path').resolve(__dirname, '../..'),
      env: databaseEnvironment(database),
      encoding: 'utf8',
    }
  );
}

function request(port, method, path, body, auth) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      port,
      method,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({
        status: res.statusCode,
        body: data ? JSON.parse(data) : null,
      }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function startApi(database) {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.DB_HOST = database.host;
  process.env.DB_PORT = database.port;
  process.env.DB_USER = database.user;
  process.env.DB_PASS = database.password;
  process.env.DB_NAME = database.database;
  for (const modulePath of [
    '../app',
    '../config/db',
    '../services/auditoria.service',
    '../services/dispositivos.service',
    '../routes/dispositivos',
    '../middleware/auth',
  ]) {
    delete require.cache[require.resolve(modulePath)];
  }
  const app = require('../app');
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  return server;
}

function authFor(user) {
  return jwt.sign({
    sub: user.id,
    username: user.username,
    rol: user.rol,
    clienteId: user.cliente_id,
    tv: user.token_version,
  }, TEST_JWT_SECRET);
}

async function withMigratedDatabase(callback) {
  return withTemporaryDatabase(async (database) => {
    const migration = migrate(database);
    assert.strictEqual(migration.status, 0, migration.stderr);
    const pool = new Pool(database);
    try {
      return await callback({ database, pool });
    } finally {
      await pool.end();
    }
  });
}

test('aprovisiona un código nuevo e imprime un token único', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Configure TEST_DATABASE_URL para ejecutar las pruebas de reclamo');
    return;
  }

  await withMigratedDatabase(async ({ database, pool }) => {
    const codigo = `US1-NEW-${Date.now()}`;
    const result = runProvision(database, [codigo]);
    assert.strictEqual(result.status, 0, result.stderr);
    const tokenLines = result.stdout.trim().split(/\r?\n/).filter((line) => line.includes('Token de reclamo:'));
    assert.strictEqual(tokenLines.length, 1);
    const token = tokenLines[0].replace('Token de reclamo: ', '');
    assert.ok(token);
    assert.strictEqual(result.stdout.match(new RegExp(token, 'g')).length, 1);

    const { rows } = await pool.query('SELECT * FROM dispositivos WHERE codigo = $1', [codigo]);
    assert.strictEqual(rows.length, 1);
    assertUnclaimedDevice(rows[0], hashTokenReclamo(token));
    await assertNoThresholds(pool, codigo);
  });
});

test('rechaza aprovisionar un código existente sin modificarlo', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Configure TEST_DATABASE_URL para ejecutar las pruebas de reclamo');
    return;
  }

  await withMigratedDatabase(async ({ database, pool }) => {
    const codigo = `US1-DUP-${Date.now()}`;
    const first = runProvision(database, [codigo]);
    assert.strictEqual(first.status, 0, first.stderr);
    const before = (await pool.query('SELECT * FROM dispositivos WHERE codigo = $1', [codigo])).rows[0];
    const second = runProvision(database, [codigo]);
    assert.notStrictEqual(second.status, 0);
    const after = (await pool.query('SELECT * FROM dispositivos WHERE codigo = $1', [codigo])).rows[0];
    assert.deepStrictEqual(after, before);
  });
});

test('rota el token de un dispositivo sin dueño e invalida el anterior', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Configure TEST_DATABASE_URL para ejecutar las pruebas de reclamo');
    return;
  }

  await withMigratedDatabase(async ({ database, pool }) => {
    const codigo = `US1-ROTATE-${Date.now()}`;
    const first = runProvision(database, [codigo]);
    const oldToken = first.stdout.trim().split('Token de reclamo: ')[1];
    const rotated = runProvision(database, ['--rotate', codigo]);
    assert.strictEqual(rotated.status, 0, rotated.stderr);
    const newToken = rotated.stdout.trim().split('Token de reclamo: ')[1];
    assert.notStrictEqual(newToken, oldToken);
    const { rows } = await pool.query(
      'SELECT token_reclamo_hash, cliente_id, activo FROM dispositivos WHERE codigo = $1',
      [codigo]
    );
    assert.strictEqual(rows[0].token_reclamo_hash, hashTokenReclamo(newToken));
    assert.notStrictEqual(rows[0].token_reclamo_hash, hashTokenReclamo(oldToken));
    assert.strictEqual(rows[0].cliente_id, null);
    assert.strictEqual(rows[0].activo, false);
  });
});

test('rechaza rotar un dispositivo con dueño sin cambiar su estado', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Configure TEST_DATABASE_URL para ejecutar las pruebas de reclamo');
    return;
  }

  await withMigratedDatabase(async ({ database, pool }) => {
    const codigo = `US1-OWNED-${Date.now()}`;
    const token = 'existing-token';
    const { rows: clients } = await pool.query(
      'INSERT INTO clientes (nombre) VALUES ($1) RETURNING id',
      [`US1-client-${Date.now()}`]
    );
    await pool.query(
      `INSERT INTO dispositivos
       (codigo, nombre, ubicacion, activo, cliente_id, token_reclamo_hash)
       VALUES ($1, 'Owned', 'Lab', true, $2, $3)`,
      [codigo, clients[0].id, hashTokenReclamo(token)]
    );
    const before = (await pool.query('SELECT * FROM dispositivos WHERE codigo = $1', [codigo])).rows[0];
    const result = runProvision(database, ['--rotate', codigo]);
    assert.notStrictEqual(result.status, 0);
    const after = (await pool.query('SELECT * FROM dispositivos WHERE codigo = $1', [codigo])).rows[0];
    assert.deepStrictEqual(after, before);
  });
});

  test('reclama con token válido y devuelve la fecha de reclamo', async (context) => {
    if (!process.env.TEST_DATABASE_URL) {
      context.skip('Configure TEST_DATABASE_URL para ejecutar las pruebas de reclamo');
      return;
    }

    await withMigratedDatabase(async ({ database, pool }) => {
      const suffix = Date.now();
      const { rows: clients } = await pool.query(
        'INSERT INTO clientes (nombre) VALUES ($1) RETURNING id',
        [`US2-client-${suffix}`]
      );
      const { rows: users } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id, token_version)
         VALUES ($1, 'fixture', 'US2 Admin', 'admin', $2, 1) RETURNING *`,
        [`us2-admin-${suffix}`, clients[0].id]
      );
      const { rows: commonUsers } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id, token_version)
         VALUES ($1, 'fixture', 'US2 User', 'comun', $2, 1) RETURNING *`,
        [`us2-user-${suffix}`, clients[0].id]
      );
      const codigo = `US2-VALID-${suffix}`;
      const token = 'us2-valid-token';
      await pool.query(
        `INSERT INTO dispositivos (codigo, activo, cliente_id, token_reclamo_hash)
         VALUES ($1, false, NULL, $2)`,
        [codigo, hashTokenReclamo(token)]
      );
      const server = await startApi(database);
      try {
        const forbidden = await request(
          server.address().port,
          'POST',
          '/api/dispositivos',
          { codigo, token },
          authFor(commonUsers[0])
        );
        assert.strictEqual(forbidden.status, 403);
        const response = await request(
          server.address().port,
          'POST',
          '/api/dispositivos',
          { codigo, token, nombre: 'Nodo US2', ubicacion: 'Lab' },
          authFor(users[0])
        );
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.body.ok, true);
        assert.strictEqual(response.body.codigo, codigo);
        assert.ok(response.body.reclamadoEn);
        const { rows } = await pool.query(
          'SELECT * FROM dispositivos WHERE codigo = $1',
          [codigo]
        );
        assert.strictEqual(rows[0].cliente_id, clients[0].id);
        assert.strictEqual(rows[0].token_reclamo_hash, null);
        assert.strictEqual(rows[0].activo, true);
      } finally {
        await new Promise((resolve) => server.close(resolve));
        await require('../config/db').end();
      }
    });
  });

  test('rechazos de reclamo usan el mismo 409 genérico y no mutan el estado', async (context) => {
    if (!process.env.TEST_DATABASE_URL) {
      context.skip('Configure TEST_DATABASE_URL para ejecutar las pruebas de reclamo');
      return;
    }

    await withMigratedDatabase(async ({ database, pool }) => {
      const suffix = Date.now();
      const { rows: clients } = await pool.query(
        'INSERT INTO clientes (nombre) VALUES ($1) RETURNING id',
        [`US2-rejections-${suffix}`]
      );
      const { rows: users } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id, token_version)
         VALUES ($1, 'fixture', 'US2 Admin', 'admin', $2, 1) RETURNING *`,
        [`us2-reject-admin-${suffix}`, clients[0].id]
      );
      const auth = authFor(users[0]);
      const codigo = `US2-REJECT-${suffix}`;
      const validToken = 'us2-rejection-token';
      await pool.query(
        `INSERT INTO dispositivos (codigo, activo, cliente_id, token_reclamo_hash)
         VALUES ($1, false, NULL, $2)`,
        [codigo, hashTokenReclamo(validToken)]
      );
      const ownedCode = `US2-OWNED-${suffix}`;
      await pool.query(
        `INSERT INTO dispositivos (codigo, activo, cliente_id, token_reclamo_hash)
         VALUES ($1, true, $2, $3)`,
        [ownedCode, clients[0].id, hashTokenReclamo(validToken)]
      );
      const server = await startApi(database);
      try {
        const cases = [
          { codigo, token: 'wrong-token' },
          { codigo },
          { codigo: `UNKNOWN-${suffix}`, token: validToken },
          { codigo: ownedCode, token: validToken },
      
        ];
        const responses = [];
        for (const body of cases) {
          responses.push(await request(server.address().port, 'POST', '/api/dispositivos', body, auth));
        }
        assert.deepStrictEqual(
          responses.map((response) => [response.status, response.body]),
          responses.map(() => [409, { error: 'No se pudo reclamar el dispositivo' }])
        );
        const success = await request(
          server.address().port,
          'POST',
          '/api/dispositivos',
          { codigo, token: validToken },
          auth
        );
        assert.strictEqual(success.status, 200);
        const reused = await request(
          server.address().port,
          'POST',
          '/api/dispositivos',
          { codigo, token: validToken },
          auth
        );
        assert.deepStrictEqual(reused, {
          status: 409,
          body: { error: 'No se pudo reclamar el dispositivo' },
        });
      } finally {
        await new Promise((resolve) => server.close(resolve));
        await require('../config/db').end();
      }
    });
  });

  test('dos reclamos concurrentes con el mismo token producen un solo éxito', async (context) => {
    if (!process.env.TEST_DATABASE_URL) {
      context.skip('Configure TEST_DATABASE_URL para ejecutar las pruebas de reclamo');
      return;
    }

    await withMigratedDatabase(async ({ database, pool }) => {
      const suffix = Date.now();
      const { rows: clients } = await pool.query(
        'INSERT INTO clientes (nombre) VALUES ($1), ($2) RETURNING id',
        [`US2-race-a-${suffix}`, `US2-race-b-${suffix}`]
      );
      const { rows: users } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id, token_version)
         VALUES ($1, 'fixture', 'US2 A', 'admin', $2, 1), ($3, 'fixture', 'US2 B', 'admin', $4, 1)
         RETURNING *`,
        [`us2-race-a-${suffix}`, clients[0].id, `us2-race-b-${suffix}`, clients[1].id]
      );
      const codigo = `US2-RACE-${suffix}`;
      const token = 'us2-race-token';
      await pool.query(
        `INSERT INTO dispositivos (codigo, activo, cliente_id, token_reclamo_hash)
         VALUES ($1, false, NULL, $2)`,
        [codigo, hashTokenReclamo(token)]
      );
      const server = await startApi(database);
      try {
        const responses = await Promise.all(users.map((user) => request(
          server.address().port,
          'POST',
          '/api/dispositivos',
          { codigo, token },
          authFor(user)
        )));
        assert.deepStrictEqual(responses.map((response) => response.status).sort(), [200, 409]);
        const { rows } = await pool.query(
          'SELECT cliente_id, activo, reclamado_en, token_reclamo_hash FROM dispositivos WHERE codigo = $1',
          [codigo]
        );
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].activo, true);
        assert.ok(rows[0].cliente_id);
        assert.ok(rows[0].reclamado_en);
        assert.strictEqual(rows[0].token_reclamo_hash, null);
      } finally {
        await new Promise((resolve) => server.close(resolve));
        await require('../config/db').end();
      }
    });
  });

  test('el formulario frontend envía token y usa un rechazo genérico', () => {
    const index = fs.readFileSync(
      require('path').resolve(__dirname, '../../../frontend/index.html'),
      'utf8'
    );
    const sharedApp = fs.readFileSync(
      require('path').resolve(__dirname, '../../../frontend/shared/app.js'),
      'utf8'
    );
    assert.match(index, /id="alta-token"/);
    assert.match(index, /token: tokenReclamo/);
    assert.match(index, /response\.status === 409/);
    assert.match(sharedApp, /function mensajeReclamoRechazado\(\)/);
  });
