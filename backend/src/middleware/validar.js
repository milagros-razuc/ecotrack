function validar(schema) {
  return (req, res, next) => {
    const resultado = schema.safeParse(req.body);
    if (!resultado.success) {
      const primerError = resultado.error.issues[0];
      return res.status(400).json({ error: `${primerError.path.join('.')}: ${primerError.message}` });
    }
    req.body = resultado.data;
    next();
  };
}

function validarQuery(schema) {
  return (req, res, next) => {
    const resultado = schema.safeParse(req.query);
    if (!resultado.success) {
      const primerError = resultado.error.issues[0];
      return res.status(400).json({ error: `${primerError.path.join('.')}: ${primerError.message}` });
    }
    req.query = resultado.data;
    next();
  };
}

module.exports = validar;
module.exports.validarQuery = validarQuery;
