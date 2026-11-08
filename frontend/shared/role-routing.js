(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ecotrackRoleRouting = api;
})(typeof window !== 'undefined' ? window : null, function () {
  function destinoPorRol(rol) {
    return rol === 'platform_admin' ? 'plataforma.html' : 'index.html';
  }

  function decidirAcceso({ rol, pagina, haySesion }) {
    if (!haySesion) return { permitido: false, destino: 'login.html' };
    if (pagina === 'plataforma' && rol !== 'platform_admin') {
      return { permitido: false, destino: 'index.html' };
    }
    if (pagina !== 'plataforma' && rol === 'platform_admin') {
      return { permitido: false, destino: 'plataforma.html' };
    }
    return { permitido: true };
  }

  return { destinoPorRol, decidirAcceso };
});
