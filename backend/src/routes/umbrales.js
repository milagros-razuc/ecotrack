const express = require('express');
const umbralesService = require('../services/umbrales.service');
const validar = require('../middleware/validar');
const verificarRol = require('../middleware/rol');
const { umbralSchema } = require('../schemas');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { dispositivo } = req.query;
    const umbrales = await umbralesService.listar(dispositivo, req.clienteId);
    res.json(umbrales);
  } catch (err) {
    next(err);
  }
});

// Puede devolver error si el dispositivo no existe o no pertenece al
// cliente del admin logueado (ver umbrales.service.js): 404, para que
// configuracion.html lo muestre en vez de fingir que se guardó.
router.post('/', verificarRol('admin'), validar(umbralSchema), async (req, res, next) => {
  try {
    const { dispositivoCodigo, variable, umbralMin, umbralMax, notificacionesActivas } = req.body;
    const resultado = await umbralesService.crearOActualizar({
      dispositivoCodigo, variable, umbralMin, umbralMax, notificacionesActivas,
      clienteId: req.clienteId,
    });
    if (resultado.error) {
      return res.status(404).json({ error: resultado.error });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
