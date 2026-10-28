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

const ERROR_RECLAMO = 'No se pudo reclamar el dispositivo';

function rechazarTokenAusente(req, res, next) {
  if (typeof req.body?.token !== 'string' || req.body.token.trim() === '') {
    return res.status(409).json({ error: ERROR_RECLAMO });
  }
  next();
}

// Reclamo de un dispositivo aprovisionado para el cliente del admin logueado.
router.post('/', verificarRol('admin'), rechazarTokenAusente, validar(dispositivoSchema), async (req, res, next) => {
  try {
    const { codigo, nombre, ubicacion, token } = req.body;
    const resultado = await dispositivosService.reclamar({
      codigo, nombre, ubicacion, token, clienteId: req.clienteId,
    });
    if (!resultado) {
      return res.status(409).json({ error: ERROR_RECLAMO });
    }

    auditoriaService.registrar({
      clienteId: req.clienteId,
      usuarioId: req.usuario.sub,
      usuarioUsername: req.usuario.username,
      accion: 'reclamar_dispositivo',
      entidad: 'dispositivo',
      entidadId: codigo,
      detalle: `Nombre: ${nombre || '—'} · Ubicación: ${ubicacion || '—'}`,
    });

    res.json({ ok: true, codigo: resultado.codigo, reclamadoEn: resultado.reclamadoEn });
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

    await auditoriaService.registrar({
      clienteId: req.clienteId,
      usuarioId: req.usuario.sub,
      usuarioUsername: req.usuario.username,
      accion: 'baja_dispositivo',
      entidad: 'dispositivo',
      entidadId: req.params.codigo,
      detalle: `Dispositivo ${req.params.codigo} liberado y dado de baja`,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
