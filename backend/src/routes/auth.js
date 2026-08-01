const express = require('express');
const authService = require('../services/auth.service');
const verificarToken = require('../middleware/auth');
const validar = require('../middleware/validar');
const { loginSchema, changePasswordSchema } = require('../schemas');

const router = express.Router();

router.post('/login', validar(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const resultado = await authService.login(username, password);

    if (resultado.error) {
      return res.status(401).json({ error: resultado.error });
    }

    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

router.get('/me', verificarToken, async (req, res, next) => {
  try {
    const usuario = await authService.obtenerPorId(req.usuario.sub);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', verificarToken, validar(changePasswordSchema), async (req, res, next) => {
  try {
    const { passwordActual, passwordNueva } = req.body;

    const resultado = await authService.cambiarPassword(req.usuario.sub, passwordActual, passwordNueva);

    if (resultado.error) {
      return res.status(400).json({ error: resultado.error });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
