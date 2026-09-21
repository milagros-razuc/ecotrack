const express = require('express');
const alertasService = require('../services/alertas.service');
const validar = require('../middleware/validar');
const { actualizarEstadoAlertaSchema } = require('../schemas');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { dispositivo, estado, variable, pagina, limite, fechaDesde, fechaHasta } = req.query;
    const resultado = await alertasService.listar({
      dispositivo, estado, variable, pagina, limite, fechaDesde, fechaHasta,
      clienteId: req.clienteId,
    });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

router.get('/distribucion', async (req, res, next) => {
  try {
    const { dispositivo } = req.query;
    const datos = await alertasService.distribucionPorVariable({ dispositivo, clienteId: req.clienteId });
    res.json(datos);
  } catch (err) {
    next(err);
  }
});

// comentario es opcional (RF11): el modal "Gestionar" de auditor.html lo
// manda siempre, aunque sea string vacío, así que no rompe si no viene.
router.patch('/:id', validar(actualizarEstadoAlertaSchema), async (req, res, next) => {
  try {
    const { estado, comentario } = req.body;
    const alerta = await alertasService.actualizarEstado(req.params.id, estado, req.clienteId, comentario);
    if (!alerta) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    res.json(alerta);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
