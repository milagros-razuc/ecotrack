const express = require('express');
const auditoriaService = require('../services/auditoria.service');
const verificarRol = require('../middleware/rol');

const router = express.Router();

// El log de auditoría es una función administrativa más: mismo criterio
// que usuarios.js
router.use(verificarRol('admin'));

// El listado unifica auditoría administrativa y acciones de alertas, siempre
// limitado al cliente resuelto por el token.
router.get('/', async (req, res, next) => {
  try {
    const { entidad, accion, pagina, limite, fechaDesde, fechaHasta } = req.query;
    const resultado = await auditoriaService.listar({
      clienteId: req.clienteId, entidad, accion, pagina, limite, fechaDesde, fechaHasta,
    });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
