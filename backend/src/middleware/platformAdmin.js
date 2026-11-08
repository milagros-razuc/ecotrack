function requirePlatformAdmin(req, res, next) {
  if (!req.usuario) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (req.usuario.rol !== 'platform_admin') {
    return res.status(403).json({ error: 'No tenés permisos para realizar esta acción' });
  }
  next();
}

module.exports = requirePlatformAdmin;
