const express = require('express');
const { verificarApiKey } = require('../middleware/apiKey');
const dispositivosService = require('../services/dispositivos.service');
const lecturasService = require('../services/lecturas.service');
const alertasService = require('../services/alertas.service');

const router = express.Router();

// API pública de solo lectura (RF19/RI20): usa la clave del header
// X-Api-Key en vez de sesión de dashboard. verificarApiKey resuelve
// req.clienteId a partir de la clave.
router.use(verificarApiKey);
router.use(verificarApiKey, apiPublicaPorClave); 

router.get('/dispositivos', async (req, res, next) => {
  try {
    const dispositivos = await dispositivosService.listar(req.clienteId);
    res.json(dispositivos);
  } catch (err) {
    next(err);
  }
});

router.get('/lecturas', async (req, res, next) => {
  try {
    const { dispositivo, limite } = req.query;
    const lecturas = await lecturasService.listar({ dispositivo, limite, clienteId: req.clienteId });
    res.json(lecturas);
  } catch (err) {
    next(err);
  }
});

router.get('/alertas', async (req, res, next) => {
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

module.exports = router;

