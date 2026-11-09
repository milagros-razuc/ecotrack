(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ecotrackFirstLogin = api;
})(typeof window !== 'undefined' ? window : null, function () {
  function debeCambiarPassword(respuesta) {
    return respuesta?.mustChangePassword === true;
  }

  return { debeCambiarPassword };
});
