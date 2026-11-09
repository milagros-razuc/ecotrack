const express = require('express');
const plataformaService = require('../services/plataforma.service');
const validar = require('../middleware/validar');
const { crearClienteAdminSchema, provisionarDispositivosSchema } = require('../schemas');
const { lastReadingWindowDays, rateLimits } = require('../config/platformPanelConfig');
const { MemoryStore, rateLimit } = require('express-rate-limit');
const socketRegistry = require('../realtime/socketRegistry');
const { PlatformValidationError } = plataformaService;
const { PlatformProvisioningError } = plataformaService;
const { PlatformConflictError } = plataformaService;

const router = express.Router();
function createReadLimiter(options = {}) {
  return rateLimit({
    windowMs: rateLimits.read.windowMs,
    max: rateLimits.read.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Límite de solicitudes excedido.' },
    ...options,
  });
}

function createProvisionLimiter(options = {}) {
  return rateLimit({
    windowMs: rateLimits.provision.windowMs,
    max: rateLimits.provision.max,
    keyGenerator: (req) => String(req.usuario?.sub),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Límite de solicitudes excedido.' },
    ...options,
  });
}

function createClientAdminLimiter(options = {}) {
  const { store: configuredStore, ...limiterOptions } = options;
  const store = configuredStore || new MemoryStore();
  const limiter = rateLimit({
    windowMs: rateLimits.clientAdmin.windowMs,
    max: rateLimits.clientAdmin.max,
    keyGenerator: (req) => String(req.usuario?.sub),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Límite de solicitudes excedido.' },
    ...limiterOptions,
    store,
  });
  limiter.resetAll = () => store.resetAll();
  return limiter;
}

const readLimiter = createReadLimiter();
const provisionLimiter = createProvisionLimiter();
const clientAdminRateLimitStore = new MemoryStore();
const clientAdminLimiter = createClientAdminLimiter({ store: clientAdminRateLimitStore });

function resetClientAdminRateLimit() {
  return clientAdminRateLimitStore.resetAll();
}

function handleErrors(handler) {
  return async (req, res, next) => {
    try {
      res.json(await handler(req));
    } catch (error) {
      if (error instanceof PlatformValidationError) return res.status(400).json({ error: error.message });
      if (error instanceof PlatformProvisioningError) return res.status(500).json({ error: error.message });
      next(error);
    }
  };
}

router.get('/resumen', readLimiter, handleErrors(() => plataformaService.resumen()));
router.get('/clientes', readLimiter, handleErrors(() => plataformaService.listarClientes()));
router.get('/dispositivos', readLimiter, handleErrors((req) =>
  plataformaService.listarDispositivos(req.query, lastReadingWindowDays)));
// Todos los intentos cuentan, incluidos 400 y 409, para frenar abuso y fuerza bruta de nombres.
router.post('/clientes', clientAdminLimiter, validar(crearClienteAdminSchema), async (req, res, next) => {
  try {
    const result = await plataformaService.crearClienteAdmin({
      nombreCliente: req.body.nombre_cliente,
      username: req.body.username,
      nombreAdmin: req.body.nombre_admin,
      motivo: req.body.motivo,
      usuario: req.usuario,
    });
    try {
      socketRegistry.getActiveRegistry()?.emitToPlatformAdmins('platform:cliente-creado', {
        cliente: {
          id: result.cliente.id,
          nombre: result.cliente.nombre,
        },
      });
    } catch (error) {
      console.error(error.message);
    }
    return res.set('Cache-Control', 'no-store').status(201).json(result);
  } catch (error) {
    if (error instanceof PlatformConflictError) {
      return res.status(409).json({ error: error.message, code: error.code });
    }
    return next(error);
  }
});
router.post('/dispositivos', provisionLimiter, validar(provisionarDispositivosSchema), async (req, res, next) => {
  try {
    const items = await plataformaService.fabricarDispositivos({
      ...req.body,
      usuario: req.usuario,
    });
    res.set('Cache-Control', 'no-store').status(201).json({ items });
  } catch (error) {
    if (error instanceof PlatformProvisioningError) {
      return res.status(500).json({ error: error.message });
    }
    return next(error);
  }
});

module.exports = router;
module.exports.createReadLimiter = createReadLimiter;
module.exports.createProvisionLimiter = createProvisionLimiter;
module.exports.createClientAdminLimiter = createClientAdminLimiter;
module.exports.resetClientAdminRateLimit = resetClientAdminRateLimit;
