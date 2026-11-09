const assert = require('node:assert/strict');
const test = require('node:test');
const { isPasswordChangeRequired, shouldEndSession } = require('./socket-auth');

test('isPasswordChangeRequired solo reconoce PASSWORD_CHANGE_REQUIRED', () => {
  assert.equal(isPasswordChangeRequired({ data: { code: 'PASSWORD_CHANGE_REQUIRED' } }), true);
  assert.equal(isPasswordChangeRequired({ data: { code: 'AUTHENTICATION_ERROR' } }), false);
  assert.equal(isPasswordChangeRequired(null), false);
  assert.equal(isPasswordChangeRequired(undefined), false);
});

test('shouldEndSession conserva las reglas de cierre de sesión', () => {
  assert.equal(shouldEndSession({ data: { code: 'PASSWORD_CHANGE_REQUIRED' } }), false);
  assert.equal(shouldEndSession({ data: { code: 'AUTHENTICATION_ERROR' } }), true);
  assert.equal(shouldEndSession(null, 'io server disconnect'), true);
});
