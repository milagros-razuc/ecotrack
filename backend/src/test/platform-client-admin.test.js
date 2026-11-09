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
  const passwords = Array.from({ length: 2000 }, () => generateTemporaryPassword());
  for (const password of passwords) {
    assert.equal(password.length, 20);
    assert.match(password, /^[A-HJ-NP-Za-km-z2-9]+$/);
    assert.doesNotMatch(password, /[0O1Il]/);
  }
  assert.notEqual(passwords[0], passwords[1]);
});

test('Feature 021 temporary password validates the requested length', () => {
  assert.throws(() => generateTemporaryPassword(15), /16/);
  assert.equal(generateTemporaryPassword(16).length, 16);
});
