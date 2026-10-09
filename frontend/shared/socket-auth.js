(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ecotrackSocketAuth = api;
})(typeof window !== 'undefined' ? window : null, function () {
  function isAuthenticationError(error) {
    return error?.data?.code === 'AUTHENTICATION_ERROR';
  }

  function shouldEndSession(error, reason) {
    return isAuthenticationError(error) || reason === 'io server disconnect';
  }

  return { isAuthenticationError, shouldEndSession };
});
