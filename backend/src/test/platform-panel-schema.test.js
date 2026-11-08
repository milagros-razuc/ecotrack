const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const test = require('node:test');
const { requireTestDatabase } = require('./platform-panel.test-support');

const root = path.resolve(__dirname, '../../..');
const migrationsDir = path.join(root, 'backend', 'migrations');

function migrationNames() {
  return fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
}

test('el esquema real de lecturas usa dispositivo_codigo', async () => {
  const database = requireTestDatabase();
  const pool = new Pool({ connectionString: database.connectionString });
  try {
    const { rows } = await pool.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'lecturas'
        AND column_name = 'dispositivo_codigo'
    `);
    assert.equal(rows.length, 1, 'la base real debe tener lecturas.dispositivo_codigo');
  } finally {
    await pool.end();
  }
  const migrateSource = fs.readFileSync(path.join(root, 'backend', 'src', 'config', 'migrate.js'), 'utf8');
  assert.match(migrateSource, /dispositivo_codigo\s+VARCHAR\(50\)\s+REFERENCES\s+dispositivos\(codigo\)/);
});

test('la migración del índice cubre la tabla padre particionada', async () => {
  const database = requireTestDatabase();
  const pool = new Pool({ connectionString: database.connectionString });
  try {
    const { rows } = await pool.query(`
      SELECT c.relkind,
             array_agg(a.attname::text ORDER BY key.ordinality)::text[] AS columns,
             array_agg((i.indoption[key.ordinality - 1] & 1) = 1 ORDER BY key.ordinality)::boolean[] AS descending
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS key(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = key.attnum
      WHERE i.indrelid = 'lecturas'::regclass
        AND i.indisvalid
        AND i.indisready
        AND i.indpred IS NULL
        AND i.indnkeyatts = 2
      GROUP BY c.relkind, i.indexrelid
    `);
    assert.ok(rows.some((row) => row.relkind === 'p'), 'lecturas debe ser tabla particionada');
    assert.ok(
      rows.some(
        (row) =>
          Array.isArray(row.columns) &&
          row.columns.join(',') === 'dispositivo_codigo,timestamp' &&
          Array.isArray(row.descending) &&
          row.descending.join(',') === 'false,true',
      ),
      'falta un índice equivalente por columnas y orden en la tabla padre',
    );
  } finally {
    await pool.end();
  }
  const migration = fs.readFileSync(path.join(migrationsDir, '019_platform_reading_index.sql'), 'utf8');
  assert.match(migration, /IF NOT EXISTS\s*\(\s*SELECT 1\s+FROM pg_index/is);
  assert.match(migration, /indrelid\s*=\s*'lecturas'::regclass/i);
  assert.match(migration, /indisvalid/i);
  assert.match(migration, /indisready/i);
  assert.match(migration, /indpred\s+IS\s+NULL/i);
  assert.match(migration, /dispositivo_codigo\s*,\s*timestamp\s+DESC/i);
  assert.match(migration, /ON\s+lecturas\s*\(/i);
});

test('las migraciones nuevas declaran operaciones repetibles', () => {
  const roleMigration = fs.readFileSync(path.join(migrationsDir, '016_platform_admin_role.sql'), 'utf8');
  const platformClientMigration = fs.readFileSync(path.join(migrationsDir, '017_platform_client.sql'), 'utf8');
  const auditMigration = fs.readFileSync(path.join(migrationsDir, '018_audit_actor.sql'), 'utf8');
  const indexMigration = fs.readFileSync(path.join(migrationsDir, '019_platform_reading_index.sql'), 'utf8');
  assert.match(roleMigration, /DROP CONSTRAINT IF EXISTS/i);
  assert.match(platformClientMigration, /ADD COLUMN IF NOT EXISTS/i);
  assert.match(platformClientMigration, /CREATE UNIQUE INDEX IF NOT EXISTS/i);
  assert.match(auditMigration, /ADD COLUMN IF NOT EXISTS/i);
  assert.match(indexMigration, /IF NOT EXISTS\s*\(\s*SELECT 1\s+FROM pg_index/is);
  assert.match(indexMigration, /indrelid\s*=\s*'lecturas'::regclass/i);
  assert.match(indexMigration, /indisvalid/i);
  assert.match(indexMigration, /indisready/i);
  assert.match(indexMigration, /indpred\s+IS\s+NULL/i);
  assert.doesNotMatch(indexMigration, /CREATE INDEX IF NOT EXISTS/i);
});

test('la migración 019 es idempotente y reutiliza el índice existente', async () => {
  const database = requireTestDatabase();
  const migration = fs.readFileSync(path.join(migrationsDir, '019_platform_reading_index.sql'), 'utf8');
  const pool = new Pool({ connectionString: database.connectionString });
  try {
    await pool.query('DROP INDEX IF EXISTS idx_lecturas_dispositivo_ts_platform');
    await pool.query(migration);
    await pool.query(migration);
    const { rows } = await pool.query(`
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'idx_lecturas_dispositivo_ts_platform'
        AND n.nspname = current_schema()
        AND relkind = 'i'
    `);
    assert.equal(rows.length, 0, 'no debe crear un índice alternativo si ya existe uno equivalente');
  } finally {
    await pool.query('DROP INDEX IF EXISTS idx_lecturas_dispositivo_ts_platform').catch(() => {});
    await pool.end();
  }
});

test('las migraciones 016 a 019 siguen a la lista real y no editan 014 o 015', () => {
  const names = migrationNames();
  assert.equal(names.indexOf('016_platform_admin_role.sql'), names.indexOf('015_firmware_version.sql') + 1);
  assert.deepEqual(names.slice(-4), [
    '016_platform_admin_role.sql',
    '017_platform_client.sql',
    '018_audit_actor.sql',
    '019_platform_reading_index.sql',
  ]);
  for (const migration of ['014_factory_devices.sql', '015_firmware_version.sql']) {
    const committed = execFileSync('git', ['show', `HEAD:backend/migrations/${migration}`], {
      cwd: root,
      encoding: 'utf8',
    }).replace(/\r\n/g, '\n');
    const current = fs.readFileSync(path.join(migrationsDir, migration), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(current, committed, `${migration} no debe modificarse`);
  }
});
