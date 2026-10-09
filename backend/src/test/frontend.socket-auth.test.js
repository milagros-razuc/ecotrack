const assert = require('assert');
const test = require('node:test');
const {
  isAuthenticationError,
  shouldEndSession,
} = require('../../../frontend/shared/socket-auth');

test('socket auth helper recognizes authentication errors', () => {
  assert.strictEqual(isAuthenticationError({ data: { code: 'AUTHENTICATION_ERROR' } }), true);
  assert.strictEqual(isAuthenticationError(new Error('network failure')), false);
});

test('socket auth helper ends the session for authentication disconnects', () => {
  assert.strictEqual(shouldEndSession({ data: { code: 'AUTHENTICATION_ERROR' } }), true);
  assert.strictEqual(shouldEndSession(null, 'io server disconnect'), true);
  assert.strictEqual(shouldEndSession(null, 'transport close'), false);
});