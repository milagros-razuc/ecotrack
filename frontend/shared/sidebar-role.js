(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ecotrackSidebarRole = api;
})(typeof window !== 'undefined' ? window : null, function () {
  function etiquetaRolSidebar(rol) {
    if (rol === 'platform_admin') return 'Plataforma';
    if (rol === 'admin') return 'Administrador';
    return 'Usuario';
  }

  function etiquetaRolPerfil(rol) {
    if (rol === 'platform_admin') return 'Plataforma';
    if (rol === 'admin') return 'Administrador';
    return 'Común';
  }

  return { etiquetaRolSidebar, etiquetaRolPerfil };
});
