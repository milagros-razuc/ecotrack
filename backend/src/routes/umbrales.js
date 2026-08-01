const express = require('express');
const umbralesService = require('../services/umbrales.service');
const validar = require('../middleware/validar');
const { umbralSchema } = require('../schemas');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { dispositivo } = req.query;
    const umbrales = await umbralesService.listar(dispositivo);
    res.json(umbrales);
  } catch (err) {
    next(err);
  }
});

router.post('/', validar(umbralSchema), async (req, res, next) => {
  try {
    const { dispositivoCodigo, variable, umbralMin, umbralMax } = req.body;
    await umbralesService.crearOActualizar({ dispositivoCodigo, variable, umbralMin, umbralMax });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
