const DEFAULT_CORS_ORIGIN = 'http://localhost:8080';

function obtenerOrigenesPermitidos(value = process.env.CORS_ORIGIN) {
  const configuredOrigins = (value || DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const origins = [...new Set(configuredOrigins)];
  if (origins.includes('*')) {
    throw new Error('CORS_ORIGIN no puede contener el comodín "*"');
  }

  return origins.length > 0 ? origins : [DEFAULT_CORS_ORIGIN];
}

module.exports = { obtenerOrigenesPermitidos };
