const assert = require('assert');
const test = require('node:test');
const { spawnSync } = require('child_process');
const { Pool } = require('pg');
const {
  withTemporaryDatabase,
  assertUnclaimedDevice,
  assertNoThresholds,
} = require('./realtime.test-support');
const { hashTokenReclamo } = require('../services/dispositivos.service');

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
