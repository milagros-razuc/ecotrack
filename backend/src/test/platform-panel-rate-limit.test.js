const assert = require('node:assert/strict');
const test = require('node:test');

test('los límites de lectura y reset tienen contadores y valores separados', () => {
  const config = require('../config/platformPanelConfig');
  assert.equal(config.rateLimits.reset.max, 10);
  assert.equal(config.rateLimits.reset.windowMs, 15 * 60 * 1000);
  assert.equal(config.rateLimits.read.max, 300);
  assert.equal(config.rateLimits.read.windowMs, 15 * 60 * 1000);
  assert.notEqual(config.rateLimits.reset.counterKey, config.rateLimits.read.counterKey);
});

test('los límites aceptan overrides por entorno', () => {
  const modulePath = require.resolve('../config/platformPanelConfig');
  process.env.PLATFORM_RESET_RATE_LIMIT_MAX = '5';
  process.env.PLATFORM_READ_RATE_LIMIT_MAX = '500';
  delete require.cache[modulePath];
  const config = require(modulePath);
  assert.equal(config.rateLimits.reset.max, 5);
  assert.equal(config.rateLimits.read.max, 500);
  delete process.env.PLATFORM_RESET_RATE_LIMIT_MAX;
  delete process.env.PLATFORM_READ_RATE_LIMIT_MAX;
});
