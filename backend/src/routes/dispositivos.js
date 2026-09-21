const express = require('express');
const dispositivosService = require('../services/dispositivos.service');
const auditoriaService = require('../services/auditoria.service');
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
router.post('/', verificarRol('admin'), validar(dispositivoSchema), async (req, res, next) => {
  try {
    const { codigo, nombre, ubicacion } = req.body;
    const resultado = await dispositivosService.crearOActualizar({
      codigo, nombre, ubicacion, clienteId: req.clienteId,
    });
    if (resultado.error) {
      return res.status(409).json({ error: resultado.error });
    }

    // RF14: no frena la respuesta ni afecta el resultado si falla.
    auditoriaService.registrar({
      clienteId: req.clienteId,
      usuarioId: req.usuario.sub,
      usuarioUsername: req.usuario.username,
      accion: 'alta_o_reclamo_dispositivo',
      entidad: 'dispositivo',
      entidadId: codigo,
      detalle: `Nombre: ${nombre || '—'} · Ubicación: ${ubicacion || '—'}`,
    });

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

    auditoriaService.registrar({
      clienteId: req.clienteId,
      usuarioId: req.usuario.sub,
      usuarioUsername: req.usuario.username,
      accion: 'baja_dispositivo',
      entidad: 'dispositivo',
      entidadId: req.params.codigo,
      detalle: `Dispositivo ${req.params.codigo} dado de baja (baja lógica)`,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
