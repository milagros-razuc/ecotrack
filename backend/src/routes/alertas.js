const express = require('express');
const alertasService = require('../services/alertas.service');
const alertaAccionesService = require('../services/alerta-acciones.service');
const auditoriaService = require('../services/auditoria.service');
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

async function obtenerHistorial(req, res, next) {
  try {
    const alerta = await alertasService.obtenerPorId(req.params.id, req.clienteId);
    if (!alerta) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    const acciones = await alertaAccionesService.listar({
      alertaId: alerta.id,
      clienteId: req.clienteId,
    });
    res.json({ data: acciones });
  } catch (err) {
    next(err);
  }
}

router.get('/:id/historial', obtenerHistorial);
router.get('/:id/acciones', obtenerHistorial);

router.patch('/:id', validar(actualizarEstadoAlertaSchema), async (req, res, next) => {
  try {
    const { estado, comentario } = req.body;
    const resultado = await alertasService.actualizarEstado({
      id: req.params.id,
      estado,
      clienteId: req.clienteId,
      comentario,
      usuarioId: req.usuario.sub,
      usuarioUsername: req.usuario.username,
    });
    if (!resultado) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    if (resultado.auditoria) {
      await auditoriaService.registrar({
        clienteId: resultado.alerta.cliente_id,
        usuarioId: req.usuario.sub,
        usuarioUsername: req.usuario.username,
        accion: 'cambiar_estado_alerta',
        entidad: 'alerta',
        entidadId: String(resultado.alerta.id),
        detalle: `Estado anterior: ${resultado.auditoria.estadoAnterior}; estado nuevo: ${resultado.auditoria.estadoNuevo}; comentario: ${resultado.auditoria.comentario || 'Sin comentario'}`,
      });
    }
    res.json(resultado.alerta);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
