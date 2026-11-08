const assert = require('node:assert/strict');
const test = require('node:test');
const {
  shouldRenderPlatformPanel,
  requestResetConfirmation,
} = require('./platform-panel.test-support');

test('el harness del panel cubre rol y confirmación de reset', () => {
  assert.equal(shouldRenderPlatformPanel('platform_admin'), true);
  assert.equal(shouldRenderPlatformPanel('admin'), false);
  assert.equal(requestResetConfirmation(() => true), true);
  assert.equal(requestResetConfirmation(() => false), false);
});
