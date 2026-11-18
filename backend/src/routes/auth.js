const express = require('express');
const authService = require('../services/auth.service');
const verificarToken = require('../middleware/auth');
const validar = require('../middleware/validar');
const { loginLimiter, passwordChangeLimiter } = require('../middleware/rateLimiter');
const {
  loginSchema,
  changePasswordSchema,
  restrictedChangePasswordSchema,
  actualizarPerfilSchema,
} = require('../schemas');

const router = express.Router();

router.post('/login', loginLimiter, validar(loginSchema), async (req, res, next) => {   
  try {
    const { username, password } = req.body;

    const resultado = await authService.login(username, password);

    if (resultado.error) {
      return res.status(401).json({ error: resultado.error });
    }

    res.set('Cache-Control', 'no-store').json(resultado);
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

// Edita el nombre del perfil propio. Username y rol no se tocan
// acá: cambiarlos sigue siendo tarea exclusiva de CU09 (gestión de usuarios).
router.patch('/me', verificarToken, validar(actualizarPerfilSchema), async (req, res, next) => {
  try {
    const { nombre } = req.body;
    const usuario = await authService.actualizarPerfil(req.usuario.sub, { nombre });
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

function validarCambioSegunScope(req, res, next) {
  const schema = req.usuario.scope === 'change-password'
    ? restrictedChangePasswordSchema
    : changePasswordSchema;
  const resultado = schema.safeParse(req.body);
  if (!resultado.success) {
    const primerError = resultado.error.issues[0];
    return res.status(400).json({ error: `${primerError.path.join('.')}: ${primerError.message}` });
  }
  req.body = resultado.data;
  next();
}

router.post('/change-password', verificarToken, passwordChangeLimiter, validarCambioSegunScope, async (req, res, next) => {
  try {
    const { passwordActual, passwordNueva } = req.body;

    const resultado = await authService.cambiarPassword(
      req.usuario.sub,
      passwordActual,
      passwordNueva,
      { ip: req.ip, tokenRestringido: req.usuario.scope === 'change-password' },
    );

    if (resultado.error) {
      return res.status(400).json({ error: resultado.error });
    }

    res.set('Cache-Control', 'no-store').json(resultado);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
