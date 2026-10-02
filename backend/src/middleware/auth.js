const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;

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

    return payload;
  } catch (err) {
    if (err.code === 'SESSION_INVALIDATED') throw err;
    throw crearErrorAuth('INVALID_TOKEN', 'Token inválido o expirado');
  }
}

async function verificarToken(req, res, next) {
  const token = req.headers.authorization;

  try {
    req.usuario = await validarToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
}

module.exports = verificarToken;
module.exports.validarToken = validarToken;