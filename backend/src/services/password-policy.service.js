const MIN_PASSWORD_LENGTH = 12;

const COMMON_PASSWORDS = new Set([
  '123456789012',
  'password1234',
  'contraseña123',
  'contrasena123',
  'qwertyuiop12',
  'admin1234567',
]);

function validarPasswordNueva(password, passwordTemporal = null) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { valida: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` };
  }
  if (passwordTemporal !== null && password === passwordTemporal) {
    return { valida: false, error: 'La nueva contraseña no puede ser igual a la temporal' };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valida: false, error: 'La contraseña es demasiado común' };
  }
  return { valida: true };
}

module.exports = {
  COMMON_PASSWORDS,
  MIN_PASSWORD_LENGTH,
  validarPasswordNueva,
};
