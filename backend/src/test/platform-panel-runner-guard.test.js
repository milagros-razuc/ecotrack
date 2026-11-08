const assert = require('node:assert/strict');
const test = require('node:test');
const { validateDatabaseConfig } = require('../../scripts/run-migrations');

function config(overrides = {}) {
  return {
    DB_HOST: '127.0.0.1',
    DB_PORT: '5433',
    DB_NAME: 'ecotrack_test',
    DB_USER: 'test_user',
    DB_PASS: 'test_password',
    ...overrides,
  };
}

test('rechaza DB_NAME que no sea una base de pruebas sin conectarse', () => {
  assert.throws(
    () => validateDatabaseConfig(config({ DB_NAME: 'ecotrack' })),
    /DB_NAME.*\*_test.*hardening_|DB_NAME.*inválido/i,
  );
});

test('rechaza el puerto 5432 sin conectarse', () => {
  assert.throws(
    () => validateDatabaseConfig(config({ DB_PORT: '5432' })),
    /5432.*5433|puerto.*5432/i,
  );
});

test('acepta una base hardening en el puerto de pruebas', () => {
  assert.doesNotThrow(() => validateDatabaseConfig(config({ DB_NAME: 'hardening_xxx' })));
});

test('la bandera explícita permite una base no destinada a pruebas', () => {
  assert.doesNotThrow(() =>
    validateDatabaseConfig(config({ DB_NAME: 'ecotrack', DB_PORT: '5432' }), {
      allowNonTestDatabase: true,
    }),
  );
});

test('el runner no es importado por app.js ni migrate.js', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '../../..');
  for (const file of ['backend/src/app.js', 'backend/src/config/migrate.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /run-migrations\.js|runMigrations/);
  }
});
