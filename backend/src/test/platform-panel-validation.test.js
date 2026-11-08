const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PlatformValidationError,
  parsePage,
} = require('../services/plataforma.service');

test('la validación del panel usa una clase de error propia', () => {
  assert.throws(
    () => parsePage({ pagina: 'invalid' }),
    (error) => error instanceof PlatformValidationError,
  );
});
