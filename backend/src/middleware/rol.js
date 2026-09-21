// Restringe el acceso a los roles indicados. Debe usarse SIEMPRE después
// de verificarToken, ya que depende de que req.usuario venga cargado
// con el payload del JWT (que ahora incluye el campo "rol").
//
// Uso: router.use(verificarRol('admin'))
//      router.post('/', verificarRol('admin'), validar(schema), handler)
function verificarRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      // No debería pasar si el router está montado después de verificarToken,
      // pero lo cubrimos por si se usa este middleware suelto en algún lado.
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tenés permisos para realizar esta acción' });
    }

    next();
  };
}

module.exports = verificarRol;
