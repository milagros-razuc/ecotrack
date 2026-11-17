const passwordResetService = require('../services/password-reset.service');

async function resetPasswordHandler(req, res, next) {
  res.set('Cache-Control', 'no-store');
  try {
    const resultado = await passwordResetService.resetearPassword({
      solicitanteId: req.usuario.sub,
      objetivoId: req.params.id,
      ip: req.ip,
    });
    return res.status(200).json(resultado);
  } catch (error) {
    if (error instanceof passwordResetService.PasswordResetError) {
      return res.status(error.status).json({ error: error.message });
    }
    return next(error);
  }
}

module.exports = resetPasswordHandler;
