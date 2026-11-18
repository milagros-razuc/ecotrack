const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  COMMON_PASSWORDS,
  MIN_PASSWORD_LENGTH,
  MIN_TEMP_PASSWORD_LENGTH,
  validarPasswordNueva,
} = require('../services/password-policy.service');
const {
  TEMPORARY_PASSWORD_ALPHABET,
  generarPasswordTemporal,
  puedeResetear,
} = require('../services/password-reset.service');
const { crearUsuarioSchema } = require('../schemas');

const root = path.resolve(__dirname, '../../..');

test('los roles de plataforma usan platform_admin en los artefactos existentes', () => {
  const roleMigration = fs.readFileSync(path.join(root, 'backend/migrations/016_platform_admin_role.sql'), 'utf8');
  const seed = fs.readFileSync(path.join(root, 'backend/scripts/seed-platform-admin.js'), 'utf8');
  const middleware = fs.readFileSync(path.join(root, 'backend/src/middleware/platformAdmin.js'), 'utf8');
  const legacyPlatformRole = ['admin', 'plataforma'].join('_');
  assert.match(roleMigration, /platform_admin/);
  assert.match(seed, /platform_admin/);
  assert.match(middleware, /platform_admin/);
  assert.doesNotMatch(roleMigration, new RegExp(legacyPlatformRole));
  assert.doesNotMatch(seed, new RegExp(legacyPlatformRole));
  assert.doesNotMatch(middleware, new RegExp(legacyPlatformRole));
});

test('la política exige 8 caracteres, rechaza comunes y no permite reutilizar la temporal', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.deepEqual(validarPasswordNueva('1234567'), {
    valida: false,
    error: 'La contraseña debe tener al menos 8 caracteres',
  });
  assert.equal(validarPasswordNueva('password').valida, false);
  assert.equal(validarPasswordNueva('12345678').valida, false);
  assert.deepEqual(validarPasswordNueva('Nueva8!x'), { valida: true });
  assert.equal(validarPasswordNueva('Nueva-Segura-42', 'Nueva-Segura-42').valida, false);
  assert.deepEqual(validarPasswordNueva('Nueva-Segura-42', 'Temporal-1234'), { valida: true });
});

test('el generador temporal usa longitud mínima, alfabeto no ambiguo y valores distintos', () => {
  assert.equal(MIN_TEMP_PASSWORD_LENGTH, 12);
  const generated = new Set(Array.from({ length: 20 }, () => generarPasswordTemporal()));
  assert.equal(generated.size, 20);
  for (const password of generated) {
    assert.equal(password.length, 16);
    assert.match(password, new RegExp(`^[${TEMPORARY_PASSWORD_ALPHABET.replace(/[\\\]^$.*+?()[{}|]/g, '\\$&')}]+$`));
    assert.doesNotMatch(password, /[01IOl]/);
  }
  assert.throws(() => generarPasswordTemporal(11), RangeError);
});

test('la creación exige 8 para comun y conserva 12 para admin', () => {
  assert.equal(crearUsuarioSchema.safeParse({
    username: 'comun-8',
    password: 'Nueva8!x',
    rol: 'comun',
  }).success, true);
  assert.equal(crearUsuarioSchema.safeParse({
    username: 'comun-7',
    password: 'Nueva7!',
    rol: 'comun',
  }).success, false);
  assert.equal(crearUsuarioSchema.safeParse({
    username: 'admin-8',
    password: 'Nueva8!x',
    rol: 'admin',
  }).success, false);
  assert.equal(crearUsuarioSchema.safeParse({
    username: 'admin-12',
    password: 'Nueva-Segura-42',
    rol: 'admin',
  }).success, true);
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

test('puedeResetear permite a platform_admin resetear admin o comun de cualquier cliente', () => {
  const platformAdmin = { id: 1, rol: 'platform_admin', cliente_id: 100 };
  assert.equal(puedeResetear(platformAdmin, { id: 2, rol: 'admin', cliente_id: 10 }), true);
  assert.equal(puedeResetear(platformAdmin, { id: 3, rol: 'comun', cliente_id: 11 }), true);
  assert.equal(puedeResetear(platformAdmin, { id: 4, rol: 'platform_admin', cliente_id: 12 }), false);
  assert.equal(puedeResetear(platformAdmin, { id: 1, rol: 'platform_admin', cliente_id: 100 }), false);
  assert.equal(puedeResetear(platformAdmin, { id: 5, rol: 'platform_admin', cliente_id: 100 }), false);
});
