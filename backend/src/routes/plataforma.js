const express = require('express');
const plataformaService = require('../services/plataforma.service');
const { lastReadingWindowDays, rateLimits } = require('../config/platformPanelConfig');
const rateLimit = require('express-rate-limit').rateLimit;
const { PlatformValidationError } = plataformaService;

const router = express.Router();
const readLimiter = rateLimit({
  windowMs: rateLimits.read.windowMs,
  max: rateLimits.read.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de solicitudes excedido.' },
});
function handleErrors(handler) {
  return async (req, res, next) => {
    try {
      res.json(await handler(req));
    } catch (error) {
      if (error instanceof PlatformValidationError) return res.status(400).json({ error: error.message });
      next(error);
    }
  };
}

router.get('/resumen', readLimiter, handleErrors(() => plataformaService.resumen()));
router.get('/clientes', readLimiter, handleErrors(() => plataformaService.listarClientes()));
router.get('/dispositivos', readLimiter, handleErrors((req) =>
  plataformaService.listarDispositivos(req.query, lastReadingWindowDays)));

module.exports = router;
