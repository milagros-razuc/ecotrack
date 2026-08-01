const pool = require('../config/db');

async function listar(dispositivoCodigo) {
  if (dispositivoCodigo) {
    const result = await pool.query(
      'SELECT * FROM umbrales WHERE dispositivo_codigo = $1 ORDER BY variable',
      [dispositivoCodigo]
    );
    return result.rows;
  }
  const result = await pool.query('SELECT * FROM umbrales ORDER BY dispositivo_codigo, variable');
  return result.rows;
}

async function obtener(dispositivoCodigo, variable) {
  const result = await pool.query(
    'SELECT * FROM umbrales WHERE dispositivo_codigo = $1 AND variable = $2',
    [dispositivoCodigo, variable]
  );
  return result.rows[0] || null;
}

async function crearOActualizar({ dispositivoCodigo, variable, umbralMin, umbralMax, notificacionesActivas }) {
  const notificaciones = notificacionesActivas === undefined ? true : notificacionesActivas;
  await pool.query(
    `INSERT INTO umbrales (dispositivo_codigo, variable, umbral_min, umbral_max, notificaciones_activas)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (dispositivo_codigo, variable)
     DO UPDATE SET umbral_min = $3, umbral_max = $4, notificaciones_activas = $5`,
    [dispositivoCodigo, variable, umbralMin, umbralMax, notificaciones]
  );
}

module.exports = { listar, obtener, crearOActualizar };


