const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
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

test('Feature 021 temporary password llama a crypto.randomInt sobre el alfabeto de 57 caracteres', (t) => {
  const calls = [];
  t.mock.method(crypto, 'randomInt', (max) => {
    calls.push(max);
    return max - 1;
  });
  const password = generateTemporaryPassword();
  assert.equal(calls.length, 20);
  assert.ok(calls.every((max) => max === 57));
  assert.equal(password, '9'.repeat(20));
});
