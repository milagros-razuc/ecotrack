const express = require('express');
const dispositivosService = require('../services/dispositivos.service');
const validar = require('../middleware/validar');
const { dispositivoSchema } = require('../schemas');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const dispositivos = await dispositivosService.listar();
    res.json(dispositivos);
  } catch (err) {
    next(err);
  }
});

router.get('/estado', async (req, res, next) => {
  try {
    const dispositivos = await dispositivosService.listarConEstado();
    res.json(dispositivos);
  } catch (err) {
    next(err);
  }
});

router.post('/', validar(dispositivoSchema), async (req, res, next) => {
  try {
    const { codigo, nombre, ubicacion } = req.body;
    await dispositivosService.crearOActualizar({ codigo, nombre, ubicacion });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
