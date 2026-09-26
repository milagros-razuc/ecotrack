const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;

async function verificarToken(req, res, next) {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    const { rows } = await pool.query(
      'SELECT token_version FROM usuarios WHERE id = $1',
      [payload.sub]
    );

    if (rows.length === 0 || rows[0].token_version !== payload.tv) {
      return res.status(401).json({ error: 'Sesión invalidada' });
    }

    req.usuario = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = verificarToken;