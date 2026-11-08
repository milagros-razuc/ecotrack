const express = require('express');
const plataformaService = require('../services/plataforma.service');
const { lastReadingWindowDays, rateLimits } = require('../config/platformPanelConfig');
const rateLimit = require('express-rate-limit').rateLimit;
const auditoriaService = require('../services/auditoria.service');
const { resetear, ERROR_RESET_CREDENCIALES } = require('../services/resetCredenciales.service');
const pool = require('../config/db');

const router = express.Router();
const readLimiter = rateLimit({
  windowMs: rateLimits.read.windowMs,
  max: rateLimits.read.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de solicitudes excedido.' },
});
const resetLimiter = rateLimit({
  windowMs: rateLimits.reset.windowMs,
  max: rateLimits.reset.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de solicitudes excedido.' },
});

function handleErrors(handler) {
  return async (req, res, next) => {
    try {
      res.json(await handler(req));
    } catch (error) {
      if (/inválid/.test(error.message)) return res.status(400).json({ error: error.message });
      next(error);
    }
  };
}

router.get('/resumen', handleErrors(() => plataformaService.resumen()));
router.get('/clientes', handleErrors(() => plataformaService.listarClientes()));
router.get('/dispositivos', handleErrors((req) =>
  plataformaService.listarDispositivos(req.query, lastReadingWindowDays)));

router.post('/dispositivos/:codigo/reset-credenciales', resetLimiter, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.cliente_id FROM dispositivos d
       JOIN clientes c ON c.id = d.cliente_id
       WHERE d.codigo = $1 AND c.es_plataforma = false`,
      [req.params.codigo],
    );
    if (!rows[0]) return res.status(404).json({ error: ERROR_RESET_CREDENCIALES });
    const result = await resetear({ deviceId: req.params.codigo, clienteId: rows[0].cliente_id });
    await auditoriaService.registrar({
      clienteId: rows[0].cliente_id,
      usuarioId: req.usuario.sub,
      usuarioUsername: req.usuario.username,
      accion: 'reset_credenciales',
      entidad: 'dispositivo',
      entidadId: req.params.codigo,
      detalle: `Resultado: ${result.status}`,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    if (error?.message === ERROR_RESET_CREDENCIALES) {
      return res.status(409).json({ error: ERROR_RESET_CREDENCIALES });
    }
    return next(error);
  }
});

module.exports = router;
