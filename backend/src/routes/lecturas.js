const express = require('express');
const lecturasService = require('../services/lecturas.service');
const validar = require('../middleware/validar');
const { rangoFechasLecturasSchema } = require('../schemas');

const router = express.Router();

router.get('/', validar.validarQuery(rangoFechasLecturasSchema), async (req, res, next) => {
  try {
    const { dispositivo, limite, fechaDesde, fechaHasta } = req.query;
    const lecturas = await lecturasService.listar({
      dispositivo, limite, fechaDesde, fechaHasta, clienteId: req.clienteId,
    });
    res.json(lecturas);
  } catch (err) {
    next(err);
  }
});

router.get('/ultima', async (req, res, next) => {
  try {
    const lecturas = await lecturasService.ultimaPorDispositivo(req.clienteId);
    res.json(lecturas);
  } catch (err) {
    next(err);
  }
});

// Series agregadas para historico.html: ?periodo=dia|semana|mes
router.get('/agregado', validar.validarQuery(rangoFechasLecturasSchema), async (req, res, next) => {
  try {
    const { dispositivo, periodo, fechaDesde, fechaHasta } = req.query;
    const periodoValido = ['dia', 'semana', 'mes'].includes(periodo) ? periodo : 'semana';
    const datos = await lecturasService.listarAgregado({
      dispositivo, periodo: periodoValido, fechaDesde, fechaHasta, clienteId: req.clienteId,
    });
    res.json(datos);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
