const crypto = require('node:crypto');

const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*+-_=';
const TEMPORARY_PASSWORD_LENGTH = 16;

function generarPasswordTemporal(length = TEMPORARY_PASSWORD_LENGTH) {
  if (!Number.isInteger(length) || length < 12) {
    throw new RangeError('La contraseña temporal debe tener al menos 12 caracteres');
  }

  const result = [];
  const limit = 256 - (256 % TEMPORARY_PASSWORD_ALPHABET.length);
  while (result.length < length) {
    const bytes = crypto.randomBytes(length - result.length + 8);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      result.push(TEMPORARY_PASSWORD_ALPHABET[byte % TEMPORARY_PASSWORD_ALPHABET.length]);
      if (result.length === length) break;
    }
  }
  return result.join('');
}

module.exports = {
  TEMPORARY_PASSWORD_ALPHABET,
  TEMPORARY_PASSWORD_LENGTH,
  generarPasswordTemporal,
};
