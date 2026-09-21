const express = require('express');
const usuariosService = require('../services/usuarios.service');
const auditoriaService = require('../services/auditoria.service');
const validar = require('../middleware/validar');
const verificarRol = require('../middleware/rol');
const { crearUsuarioSchema, actualizarUsuarioSchema } = require('../schemas');

const router = express.Router();

// Todas las rutas de este router quedan restringidas a rol admin
router.use(verificarRol('admin'));

router.get('/', async (req, res, next) => {
  try {
    const usuarios = await usuariosService.listar(req.clienteId);
    res.json(usuarios);
  } catch (err) {
    next(err);
  }
});

router.post('/', validar(crearUsuarioSchema), async (req, res, next) => {
  try {
    const resultado = await usuariosService.crear({ ...req.body, clienteId: req.clienteId });
    if (resultado.error) {
      return res.status(409).json({ error: resultado.error });
    }

    auditoriaService.registrar({
      clienteId: req.clienteId,
      usuarioId: req.usuario.sub,
      usuarioUsername: req.usuario.username,
      accion: 'crear_usuario',
      entidad: 'usuario',
      entidadId: String(resultado.usuario.id),
      detalle: `Usuario ${resultado.usuario.username} creado con rol ${resultado.usuario.rol}`,
    });

    res.status(201).json(resultado.usuario);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validar(actualizarUsuarioSchema), async (req, res, next) => {
  try {
    const resultado = await usuariosService.actualizar(req.params.id, req.body, req.clienteId);
    if (resultado.error) {
      return res.status(400).json({ error: resultado.error });
    }

    const cambios = Object.entries(req.body)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    auditoriaService.registrar({
      clienteId: req.clienteId,
      usuarioId: req.usuario.sub,
      usuarioUsername: req.usuario.username,
      accion: 'editar_usuario',
      entidad: 'usuario',
      entidadId: String(req.params.id),
      detalle: `Usuario ${resultado.usuario.username} editado (${cambios || 'sin cambios detectados'})`,
    });

    res.json(resultado.usuario);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const resultado = await usuariosService.eliminar(req.params.id, req.usuario.sub, req.clienteId);
    if (resultado.error) {
      return res.status(400).json({ error: resultado.error });
    }

    auditoriaService.registrar({
      clienteId: req.clienteId,
      usuarioId: req.usuario.sub,
      usuarioUsername: req.usuario.username,
      accion: 'eliminar_usuario',
      entidad: 'usuario',
      entidadId: String(req.params.id),
      detalle: `Usuario id ${req.params.id} eliminado`,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
