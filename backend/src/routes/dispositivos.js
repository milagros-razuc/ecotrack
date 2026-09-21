const express = require('express');
const dispositivosService = require('../services/dispositivos.service');
const validar = require('../middleware/validar');
const verificarRol = require('../middleware/rol');
const { dispositivoSchema } = require('../schemas');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const dispositivos = await dispositivosService.listar(req.clienteId);
    res.json(dispositivos);
  } catch (err) {
    next(err);
  }
});

router.get('/estado', async (req, res, next) => {
  try {
    const dispositivos = await dispositivosService.listarConEstado(req.clienteId);
    res.json(dispositivos);
  } catch (err) {
    next(err);
  }
});

// Alta o "reclamo" de un dispositivo para el cliente del admin logueado.
// Puede devolver error si el código ya pertenece a otro cliente (ver
// dispositivos.service.js): 409, no 200, para que el front lo muestre.
router.post('/', verificarRol('admin'), validar(dispositivoSchema), async (req, res, next) => {
  try {
    const { codigo, nombre, ubicacion } = req.body;
    const resultado = await dispositivosService.crearOActualizar({
      codigo, nombre, ubicacion, clienteId: req.clienteId,
    });
    if (resultado.error) {
      return res.status(409).json({ error: resultado.error });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:codigo', verificarRol('admin'), async (req, res, next) => {
  try {
    const eliminado = await dispositivosService.eliminar(req.params.codigo, req.clienteId);
    if (!eliminado) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
