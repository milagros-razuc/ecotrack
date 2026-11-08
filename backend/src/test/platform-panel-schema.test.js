const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../../..');
const migrationsDir = path.join(root, 'backend', 'migrations');

function migrationNames() {
  return fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
}

test('el esquema real de lecturas usa dispositivo_codigo', () => {
  const migrateSource = fs.readFileSync(path.join(root, 'backend', 'src', 'config', 'migrate.js'), 'utf8');
  assert.match(migrateSource, /dispositivo_codigo\s+VARCHAR\(50\)\s+REFERENCES\s+dispositivos\(codigo\)/);
});

test('la migración del índice cubre la tabla padre particionada', () => {
  const migration = fs.readFileSync(path.join(migrationsDir, '019_platform_reading_index.sql'), 'utf8');
  assert.match(migration, /CREATE INDEX IF NOT EXISTS/i);
  assert.match(migration, /dispositivo_codigo\s*,\s*timestamp\s+DESC/i);
  assert.match(migration, /ON\s+lecturas\s*\(/i);
  assert.match(migration, /PARTITIONED|parent/i);
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
  assert.match(indexMigration, /CREATE INDEX IF NOT EXISTS/i);
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
