const express = require('express');
const usuariosService = require('../services/usuarios.service');
const validar = require('../middleware/validar');
const verificarRol = require('../middleware/rol');
const { crearUsuarioSchema, actualizarUsuarioSchema } = require('../schemas');

const router = express.Router();

// Todas las rutas de este router quedan restringidas a rol admin (RF17).
// Se asume que este router se monta después de verificarToken y
// extraerCliente en app.js, así que req.usuario y req.clienteId ya
// vienen cargados.
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
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
