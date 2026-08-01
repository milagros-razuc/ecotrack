const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function verificarToken(req, res, next) {
  // El dashboard manda el token crudo en el header Authorization
  // (sin el prefijo "Bearer "), así que lo leemos tal cual.
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = verificarToken;
