// Exige que el JWT traiga clienteId (payload emitido por auth.service tras
// el login) y lo expone en req.clienteId para que TODOS los servicios lo
// usen como filtro obligatorio en sus queries.
//
// Debe usarse SIEMPRE después de verificarToken, igual que verificarRol.
// Uso: router.use(extraerCliente)
function extraerCliente(req, res, next) {
  if (!req.usuario) {
    // No debería pasar si el router está montado después de verificarToken.
    return res.status(401).json({ error: 'No autenticado' });
  }

  if (!req.usuario.clienteId) {
    // Token viejo emitido antes de agregar clienteId al payload: se obliga
    // a re-loguear en vez de dejarlo pasar sin aislamiento entre clientes.
    return res.status(401).json({ error: 'Token inválido: falta cliente asociado. Volvé a iniciar sesión.' });
  }

  req.clienteId = req.usuario.clienteId;
  next();
}

module.exports = extraerCliente;
