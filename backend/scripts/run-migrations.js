const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

const MIGRATIONS_DIRECTORY = path.resolve(__dirname, '../migrations');
const FIRST_PLATFORM_MIGRATION = 16;

function databaseConfigFromEnvironment() {
  const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de conexión: ${missing.join(', ')}`);
  }

  return {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
  };
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

module.exports = { runMigrations, migrationFiles };
