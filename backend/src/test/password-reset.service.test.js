const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  COMMON_PASSWORDS,
  MIN_PASSWORD_LENGTH,
  validarPasswordNueva,
} = require('../services/password-policy.service');
const {
  TEMPORARY_PASSWORD_ALPHABET,
  generarPasswordTemporal,
  puedeResetear,
} = require('../services/password-reset.service');

const root = path.resolve(__dirname, '../../..');

test('los roles de plataforma usan platform_admin en los artefactos existentes', () => {
  const roleMigration = fs.readFileSync(path.join(root, 'backend/migrations/016_platform_admin_role.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(root, 'backend/scripts/seed-platform-admin.js'), 'utf8');
  const middleware = fs.readFileSync(path.join(root, 'backend/src/middleware/platformAdmin.js'), 'utf8');
  assert.match(roleMigration, /platform_admin/);
  assert.match(seed, /platform_admin/);
  assert.match(middleware, /platform_admin/);
  assert.doesNotMatch(roleMigration, /admin_plataforma/);
  assert.doesNotMatch(seed, /admin_plataforma/);
  assert.doesNotMatch(middleware, /admin_plataforma/);
});

test('la política exige 12 caracteres, rechaza comunes y no permite reutilizar la temporal', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 12);
  assert.deepEqual(validarPasswordNueva('corta'), {
    valida: false,
    error: 'La contraseña debe tener al menos 12 caracteres',
  });
  const common = [...COMMON_PASSWORDS][0];
  assert.equal(validarPasswordNueva(common).valida, false);
  assert.equal(validarPasswordNueva('Nueva-Segura-42', 'Nueva-Segura-42').valida, false);
  assert.deepEqual(validarPasswordNueva('Nueva-Segura-42', 'Temporal-1234'), { valida: true });
});

test('el generador temporal usa longitud mínima, alfabeto no ambiguo y valores distintos', () => {
  const generated = new Set(Array.from({ length: 20 }, () => generarPasswordTemporal()));
  assert.equal(generated.size, 20);
  for (const password of generated) {
    assert.equal(password.length, 16);
    assert.match(password, new RegExp(`^[${TEMPORARY_PASSWORD_ALPHABET.replace(/[\\\]^$.*+?()[{}|]/g, '\\$&')}]+$`));
    assert.doesNotMatch(password, /[01IOl]/);
  }
  assert.throws(() => generarPasswordTemporal(11), RangeError);
});

test('la migración y el servicio no recrean token_version', () => {
  const migration = fs.readFileSync(path.join(root, 'backend/migrations/021_password_reset.sql'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'backend/src/services/password-reset.service.js'), 'utf8');
  assert.doesNotMatch(migration, /token_version/i);
  assert.match(service, /token_version\s*=\s*token_version\s*\+\s*1/i);
});

test('puedeResetear permite a un admin resetear comun del mismo cliente', () => {
  const admin = { id: 1, rol: 'admin', cliente_id: 10 };
  assert.equal(puedeResetear(admin, { id: 2, rol: 'comun', cliente_id: 10 }), true);
  assert.equal(puedeResetear(admin, { id: 3, rol: 'comun', cliente_id: 11 }), false);
  assert.equal(puedeResetear(admin, { id: 4, rol: 'admin', cliente_id: 10 }), false);
  assert.equal(puedeResetear(admin, { id: 1, rol: 'admin', cliente_id: 10 }), false);
  assert.equal(puedeResetear(admin, { id: 5, rol: 'platform_admin', cliente_id: 10 }), false);
});
