const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;

async function mustChangePassword(id) {
  try {
    const { rows } = await pool.query(
      'SELECT must_change_password FROM usuarios WHERE id = $1',
      [id],
    );
    return rows.length > 0 && rows[0].must_change_password === true;
  } catch (error) {
    if (error.code === '42703') return false;
    throw error;
  }
}

function crearErrorAuth(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function validarToken(token) {
  if (!token) {
    throw crearErrorAuth('NO_TOKEN', 'No autenticado');
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query(
      'SELECT token_version FROM usuarios WHERE id = $1',
      [payload.sub]
    );

    if (rows.length === 0 || rows[0].token_version !== payload.tv) {
      throw crearErrorAuth('SESSION_INVALIDATED', 'Sesión invalidada');
    }

    return { ...payload, mustChangePassword: await mustChangePassword(payload.sub) };
  } catch (err) {
    if (err.code === 'SESSION_INVALIDATED') throw err;
    throw crearErrorAuth('INVALID_TOKEN', 'Token inválido o expirado');
  }

}

async function requerirCambioCompletado(req, res, next) {
  try {
    if (await mustChangePassword(req.usuario.sub)) {
      return res.status(403).json({
        error: 'Debe cambiar la contraseña antes de continuar',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

async function verificarToken(req, res, next) {
  const token = req.headers.authorization;

  try {
    req.usuario = await validarToken(token);
    const isPasswordChangeRoute = req.baseUrl === '/api/auth'
      && (req.path === '/me' || req.path === '/change-password');
    if (req.usuario.mustChangePassword && !isPasswordChangeRoute) {
      return res.status(403).json({
        error: 'Debe cambiar la contraseña antes de continuar',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
}

module.exports = verificarToken;
module.exports.validarToken = validarToken;
module.exports.requerirCambioCompletado = requerirCambioCompletado;