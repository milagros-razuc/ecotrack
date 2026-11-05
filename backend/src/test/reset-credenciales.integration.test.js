const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { Pool } = require('pg');

const {
  createResetCredencialesService,
  ERROR_RESET_CREDENCIALES,
} = require('../services/resetCredenciales.service');

function databaseFromEnvironment() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) return null;

  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.slice(1));
  assert.match(
    database,
    /_test$/,
    'TEST_DATABASE_URL debe apuntar exclusivamente a una base cuyo nombre termine en _test',
  );
  return {
    connectionString,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DB_HOST: url.hostname,
      DB_PORT: url.port || '5432',
      DB_NAME: database,
      DB_USER: decodeURIComponent(url.username),
      DB_PASS: decodeURIComponent(url.password),
    },
  };
}

function migrateTestDatabase(database) {
  const result = spawnSync(
    process.execPath,
    ['-e', "require('./src/config/migrate')().then(() => require('./src/config/db').end())"],
    {
      cwd: require('node:path').resolve(__dirname, '../..'),
      env: database.env,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
}

function poolThatFailsResetUpdate(pool) {
  return {
    async connect() {
      const client = await pool.connect();
      return {
        query(sql, params) {
          if (sql.includes('UPDATE dispositivos_fabrica')) {
            throw new Error('simulated local update failure');
          }
          return client.query(sql, params);
        },
        release() {
          client.release();
        },
      };
    },
  };
}

test('reset hace rollback real cuando falla UPDATE después de Dynamic Security', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Saltado: TEST_DATABASE_URL no está definida; se requiere una base PostgreSQL *_test');
    return;
  }

  const database = databaseFromEnvironment();
  migrateTestDatabase(database);
  const pool = new Pool({ connectionString: database.connectionString });
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const clientName = `reset_integration_${suffix}`;
  const deviceId = `RESET-INTEGRATION-${suffix}`;
  const factoryHash = 'a'.repeat(64);
  const dynamicCalls = [];
  const dynamicSecurity = {
    async removeDevice(identity) {
      dynamicCalls.push(identity);
    },
  };

  try {
    const { rows: clients } = await pool.query(
      'INSERT INTO clientes (nombre) VALUES ($1) RETURNING id',
      [clientName],
    );
    const clienteId = clients[0].id;
    await pool.query(
      `INSERT INTO dispositivos
       (codigo, nombre, ubicacion, activo, cliente_id, reclamado_en)
       VALUES ($1, $1, 'Test', true, $2, NOW())`,
      [deviceId, clienteId],
    );
    await pool.query(
      `INSERT INTO dispositivos_fabrica
       (device_id, factory_secret_hash, enrolled_at)
       VALUES ($1, $2, NOW())`,
      [deviceId, factoryHash],
    );

    const before = await pool.query(
      'SELECT enrolled_at FROM dispositivos_fabrica WHERE device_id = $1',
      [deviceId],
    );
    assert.ok(before.rows[0].enrolled_at);

    const service = createResetCredencialesService({
      pool: poolThatFailsResetUpdate(pool),
      dynamicSecurity,
    });
    await assert.rejects(
      service.resetear({ deviceId, clienteId }),
      new RegExp(ERROR_RESET_CREDENCIALES),
    );

    assert.equal(dynamicCalls.length, 1);
    const after = await pool.query(
      'SELECT enrolled_at FROM dispositivos_fabrica WHERE device_id = $1',
      [deviceId],
    );
    assert.ok(after.rows[0].enrolled_at);
  } finally {
    await pool.query('DELETE FROM dispositivos_fabrica WHERE device_id = $1', [deviceId]);
    await pool.query('DELETE FROM dispositivos WHERE codigo = $1', [deviceId]);
    await pool.query('DELETE FROM clientes WHERE nombre = $1', [clientName]);
    await pool.end();
  }
});
