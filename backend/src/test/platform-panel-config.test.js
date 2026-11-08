const assert = require('node:assert/strict');
const test = require('node:test');

function loadConfig(environmentValue) {
  const modulePath = require.resolve('../config/platformPanelConfig');
  delete require.cache[modulePath];
  if (environmentValue === undefined) delete process.env.PLATFORM_LAST_READING_WINDOW_DAYS;
  else process.env.PLATFORM_LAST_READING_WINDOW_DAYS = environmentValue;
  return require(modulePath);
}

test.afterEach(() => {
  delete process.env.PLATFORM_LAST_READING_WINDOW_DAYS;
});

test('la ventana ausente usa 30 días y se valida al arrancar', () => {
  assert.equal(loadConfig().lastReadingWindowDays, 30);
});

for (const value of ['abc', '1.5', '0', '-1']) {
  test(`la ventana inválida ${value} falla al arrancar`, () => {
    assert.throws(() => loadConfig(value), /PLATFORM_LAST_READING_WINDOW_DAYS/);
  });
}

test('365 días es válido', () => {
  assert.equal(loadConfig('365').lastReadingWindowDays, 365);
});

test('366 días falla al arrancar', () => {
  assert.throws(() => loadConfig('366'), /PLATFORM_LAST_READING_WINDOW_DAYS/);
});
