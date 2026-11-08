function shouldRenderPlatformPanel(role) {
  return role === 'platform_admin';
}

function requestResetConfirmation(confirmFn) {
  if (typeof confirmFn !== 'function') {
    throw new TypeError('confirmFn debe ser una función');
  }
  return confirmFn('¿Resetear credenciales del dispositivo?') === true;
}

module.exports = { shouldRenderPlatformPanel, requestResetConfirmation };
