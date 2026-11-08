(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ecotrackPlatformHttp = api;
})(typeof window !== 'undefined' ? window : null, function () {
  function accionPorEstadoHttp({ status }) {
    if (status === 401 || status === 403) return { accion: 'cerrar-sesion' };
    return { accion: 'error', mensaje: 'No se pudo cargar el panel' };
  }

  return { accionPorEstadoHttp };
});
