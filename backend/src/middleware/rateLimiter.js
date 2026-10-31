const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT_MESSAGE = {
  error: 'Demasiados intentos. Probá de nuevo en unos minutos.',
};

function createLoginRateLimiter(options) {
  return rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: LOGIN_LIMIT_MESSAGE,
    ...options,
  });
}

function normalizarUsername(username) {
  return username.trim().toLowerCase();
}

function createLoginLimiter() {
  // La instancia única mantiene los contadores en memoria: no es consistente
  // entre múltiples procesos o réplicas del backend.
  const porIpYUsuario = createLoginRateLimiter({
    max: 5,
    keyGenerator: (req) => JSON.stringify([
      ipKeyGenerator(req.ip),
      normalizarUsername(req.body.username),
    ]),
  });
  const porIp = createLoginRateLimiter({
    max: 30,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
  });
  const porUsuario = createLoginRateLimiter({
    max: 20,
    keyGenerator: (req) => normalizarUsername(req.body.username),
  });

  return (req, res, next) => {
    const tieneUsername = typeof req.body?.username === 'string';
    const limiters = tieneUsername
      ? [porIpYUsuario, porIp, porUsuario]
      : [porIp];

    let indice = 0;
    const ejecutarSiguiente = (error) => {
      if (error) return next(error);
      const limiter = limiters[indice++];
      if (!limiter) return next();
      limiter(req, res, ejecutarSiguiente);
    };

    ejecutarSiguiente();
  };
}

const loginLimiter = createLoginLimiter();

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

module.exports = {
  loginLimiter,
  createLoginLimiter,
  apiPublicaPorIp,
  apiPublicaPorClave,
};