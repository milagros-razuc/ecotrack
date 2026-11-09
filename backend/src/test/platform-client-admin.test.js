const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeClientName,
  normalizeUsername,
  isReservedUsername,
  generateTemporaryPassword,
} = require('../services/plataforma.service');

test('Feature 021 platform utilities normalize client and admin input', () => {
  assert.equal(normalizeClientName('  Acme Industrial  '), 'Acme Industrial');
  assert.equal(normalizeUsername('  Admin.User  '), 'admin.user');
  assert.equal(isReservedUsername('Platform_Admin'), true);
  assert.equal(isReservedUsername('operador-1'), false);
});

test('Feature 021 temporary password uses CSPRNG-safe unambiguous output', () => {
  const password = generateTemporaryPassword();
  assert.equal(typeof password, 'string');
  assert.ok(password.length >= 16);
  assert.match(password, /^[A-HJ-NP-Za-km-z2-9]+$/);
  assert.doesNotMatch(password, /[0O1Il]/);
});
