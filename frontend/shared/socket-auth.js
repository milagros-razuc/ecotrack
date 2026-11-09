(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ecotrackSocketAuth = api;
})(typeof window !== 'undefined' ? window : null, function () {
  function isAuthenticationError(error) {
    return error?.data?.code === 'AUTHENTICATION_ERROR';
  }

  function isPasswordChangeRequired(error) {
    return error?.data?.code === 'PASSWORD_CHANGE_REQUIRED';
  }

  function shouldEndSession(error, reason) {
    return isAuthenticationError(error) || reason === 'io server disconnect';
  }

  return { isAuthenticationError, isPasswordChangeRequired, shouldEndSession };
});
