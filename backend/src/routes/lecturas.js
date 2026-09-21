const express = require('express');
const lecturasService = require('../services/lecturas.service');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { dispositivo, limite } = req.query;
    const lecturas = await lecturasService.listar({ dispositivo, limite, clienteId: req.clienteId });
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
router.get('/agregado', async (req, res, next) => {
  try {
    const { dispositivo, periodo } = req.query;
    const periodoValido = ['dia', 'semana', 'mes'].includes(periodo) ? periodo : 'semana';
    const datos = await lecturasService.listarAgregado({ dispositivo, periodo: periodoValido, clienteId: req.clienteId });
    res.json(datos);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
