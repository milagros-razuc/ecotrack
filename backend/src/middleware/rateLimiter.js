const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Login: máximo 5 intentos cada 15 min por IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.' },
});

// API pública — primera capa: límite duro por IP, corre ANTES de resolver
// la clave. Cuenta todo el tráfico entrante sin importar si la clave es
// real o inventada, así una API key falsa rotada en cada request no sirve
// para esquivar el límite (ver P2, revisión de código).
const apiPublicaPorIp = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300, // más laxo: puede haber varios consumidores legítimos detrás del mismo NAT/proxy
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de solicitudes excedido.' },
});

// API pública — segunda capa: límite por cliente, usando req.clienteId que
// YA fue resuelto por verificarApiKey. Por eso este limiter debe montarse
// después de verificarApiKey en la cadena de middlewares, nunca antes.
const apiPublicaPorClave = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.clienteId ?? ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de solicitudes excedido.' },
});

module.exports = { loginLimiter, apiPublicaPorIp, apiPublicaPorClave };