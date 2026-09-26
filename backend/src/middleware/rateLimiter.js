const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Login: máximo 5 intentos cada 15 min por IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.' },
});

// API pública: límite por clave si viene, si no por IP (normalizada para IPv6).
const apiKeyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-api-key'] || ipKeyGenerator(req.ip),
  message: { error: 'Límite de solicitudes excedido.' },
});

module.exports = { loginLimiter, apiKeyLimiter };