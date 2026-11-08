const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const { testDatabaseConfig } = require('../src/test/realtime.test-support');

const MIGRATIONS_DIRECTORY = path.resolve(__dirname, '../migrations');
const FIRST_PLATFORM_MIGRATION = 16;
const TEST_DATABASE_PORT = '5433';

function allowNonTestDatabaseFromEnvironment() {
  return process.argv.includes('--allow-non-test-db') || process.env.ALLOW_NON_TEST_DB === '1';
}

function validateDatabaseConfig(environment, options = {}) {
  const allowNonTestDatabase = options.allowNonTestDatabase === true;
  const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'];
  const missing = required.filter((name) => !environment[name]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de conexión: ${missing.join(', ')}`);
  }

  if (!allowNonTestDatabase) {
    const connectionString = `postgresql://${encodeURIComponent(environment.DB_USER)}:${encodeURIComponent(
      environment.DB_PASS
    )}@${environment.DB_HOST}:${environment.DB_PORT}/${encodeURIComponent(environment.DB_NAME)}`;
    try {
      testDatabaseConfig(connectionString, { developmentUrl: null, developmentDatabase: null });
    } catch {
      throw new Error('DB_NAME inválido: debe terminar en _test o comenzar con hardening_');
    }
    if (String(environment.DB_PORT) === '5432') {
      throw new Error(`El runner requiere el puerto de pruebas ${TEST_DATABASE_PORT}; 5432 está reservado para desarrollo`);
    }
  }

  return {
    host: environment.DB_HOST,
    port: environment.DB_PORT,
    database: environment.DB_NAME,
    user: environment.DB_USER,
    password: environment.DB_PASS,
  };
}

function databaseConfigFromEnvironment() {
  return validateDatabaseConfig(process.env, {
    allowNonTestDatabase: allowNonTestDatabaseFromEnvironment(),
  });
}

async function migrationFiles() {
  const names = await fs.readdir(MIGRATIONS_DIRECTORY);
  return names
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .map((name) => ({ name, number: Number(name.slice(0, 3)) }))
    .filter((migration) => migration.number >= FIRST_PLATFORM_MIGRATION)
    .sort((left, right) => left.number - right.number || left.name.localeCompare(right.name));
}

async function runMigrations(pool) {
  // schema_migrations registra la versión aplicada y no detecta cambios
  // posteriores en esa migración; editar una aplicada exige una nueva.
  // Las migraciones 016+ son repetibles, incluso si fueron aplicadas a mano.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const migration of await migrationFiles()) {
    const { rows } = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [migration.name.slice(0, -4)],
    );
    if (rows.length > 0) {
      continue;
    }

    const sql = await fs.readFile(path.join(MIGRATIONS_DIRECTORY, migration.name), 'utf8');
    await pool.query(sql);
    await pool.query(
      'INSERT INTO schema_migrations (version) VALUES ($1)',
      [migration.name.slice(0, -4)],
    );
  }
}

async function main() {
  const pool = new Pool(databaseConfigFromEnvironment());
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { runMigrations, migrationFiles, validateDatabaseConfig };
