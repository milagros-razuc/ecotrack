const assert = require('node:assert/strict');
const test = require('node:test');
const { debeCambiarPassword } = require('./first-login');

test('debeCambiarPassword solo reconoce el booleano true', () => {
  assert.equal(debeCambiarPassword({ mustChangePassword: true }), true);
  assert.equal(debeCambiarPassword(undefined), false);
  assert.equal(debeCambiarPassword({ mustChangePassword: 'true' }), false);
  assert.equal(debeCambiarPassword({ mustChangePassword: 1 }), false);
  assert.equal(debeCambiarPassword(null), false);
});
