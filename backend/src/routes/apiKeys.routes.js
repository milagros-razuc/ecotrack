const express = require('express');
const apiKeysService = require('../services/apiKeys.service');
const validar = require('../middleware/validar');
const verificarRol = require('../middleware/rol');
const { crearApiKeySchema } = require('../schemas');

const router = express.Router();

// Gestión de claves: NO se hace con una API key, se hace logueado en el
// dashboard como admin. Este router se monta después de verificarToken en
// app.js (igual que usuarios.js), y acá solo se agrega la restricción de
// rol — req.usuario y req.clienteId ya vienen resueltos por ese momento.
router.use(verificarRol('admin'));

router.get('/', async (req, res, next) => {
  try {
    const claves = await apiKeysService.listar(req.clienteId);
    res.json(claves);
  } catch (err) {
    next(err);
  }
});

router.post('/', validar(crearApiKeySchema), async (req, res, next) => {
  try {
    const { nombre } = req.body;
    const resultado = await apiKeysService.crear({
      clienteId: req.clienteId,
      nombre,
      creadoPor: req.usuario.sub,
    });
    // La clave en texto plano viaja SOLO en esta respuesta — es la única
    // vez que existe fuera de la cabeza del admin. No se puede volver a
    // pedir después, ni con GET /.
    res.status(201).json({ ...resultado.apiKey, clave: resultado.clave });
  } catch (err) {
    next(err);
  }
});

// DELETE acá es revocación (baja lógica en api_keys), no un borrado físico
// — mismo criterio que ya usan dispositivos.js/usuarios.js para sus bajas.
router.delete('/:id', async (req, res, next) => {
  try {
    const revocada = await apiKeysService.revocar(req.params.id, req.clienteId);
    if (!revocada) {
      return res.status(404).json({ error: 'Clave no encontrada' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
