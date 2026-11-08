const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');
const { Pool } = require('pg');

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(__dirname, '../../..');

function requireTestDatabase() {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, 'TEST_DATABASE_URL es obligatorio');
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.slice(1));
  assert.match(database, /(?:hardening_.*|.*_test)$/, 'La base debe ser de pruebas');
  return { connectionString, url, database };
}

function assertBaseline(actual) {
  assert.equal(actual.passed, 76);
  assert.equal(actual.total, 77);
  assert.equal(actual.knownFailure, 'subtest 13');
}

async function withTemporaryMigrationDatabase(callback) {
  const migrationRunner = path.join(repositoryRoot, 'backend', 'scripts', 'run-migrations.js');
  if (!require('node:fs').existsSync(migrationRunner)) {
    throw new Error(`No existe el runner de migraciones: ${migrationRunner}`);
  }
  const source = requireTestDatabase();
  const database = `hardening_platform_migrations_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const adminConfig = {
    host: source.url.hostname,
    port: source.url.port || '5432',
    user: decodeURIComponent(source.url.username),
    password: decodeURIComponent(source.url.password),
    database: source.database,
  };
  const adminPool = new Pool(adminConfig);

  await adminPool.query(`CREATE DATABASE "${database}"`);
  await adminPool.end();

  const databaseConfig = { ...adminConfig, database };
  const env = {
    ...process.env,
    DB_HOST: databaseConfig.host,
    DB_PORT: databaseConfig.port,
    DB_USER: databaseConfig.user,
    DB_PASS: databaseConfig.password,
    DB_NAME: databaseConfig.database,
    NODE_ENV: 'production',
    ADMIN_PASS: 'temporary-migration-test-password',
  };

  try {
    await execFileAsync(process.execPath, [
      '-e',
      "require('./src/config/migrate')().then(() => require('./src/config/db').end()).catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; })",
    ], { cwd: path.join(repositoryRoot, 'backend'), env });

    return await callback({
      database,
      connectionString: `postgresql://${encodeURIComponent(databaseConfig.user)}:${encodeURIComponent(
        databaseConfig.password
      )}@${databaseConfig.host}:${databaseConfig.port}/${database}`,
      runMigrations: () =>
        execFileAsync(process.execPath, [path.join(repositoryRoot, 'backend', 'scripts', 'run-migrations.js')], {
          cwd: path.join(repositoryRoot, 'backend'),
          env,
        }),
    });
  } finally {
    const cleanupPool = new Pool(adminConfig);
    try {
      await cleanupPool.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [database],
      );
      await cleanupPool.query(`DROP DATABASE IF EXISTS "${database}"`);
    } finally {
      await cleanupPool.end();
    }
  }
}

module.exports = { requireTestDatabase, assertBaseline, withTemporaryMigrationDatabase };
