const pool = require('../config/db');

async function listar(dispositivoCodigo, clienteId) {
  const params = [clienteId];
  let where = 'd.cliente_id = $1';
  if (dispositivoCodigo) {
    params.push(dispositivoCodigo);
    where += ` AND u.dispositivo_codigo = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT u.* FROM umbrales u
     JOIN dispositivos d ON u.dispositivo_codigo = d.codigo
     WHERE ${where}
     ORDER BY u.dispositivo_codigo, u.variable`,
    params
  );
  return result.rows;
}

// Usado internamente (motor de alertas al procesar un mensaje MQTT), no
// depende de un usuario logueado: no se filtra por cliente_id a propósito.
async function obtener(dispositivoCodigo, variable) {
  const result = await pool.query(
    'SELECT * FROM umbrales WHERE dispositivo_codigo = $1 AND variable = $2',
    [dispositivoCodigo, variable]
  );
  return result.rows[0] || null;
}

async function crearOActualizar({ dispositivoCodigo, variable, umbralMin, umbralMax, notificacionesActivas, clienteId }) {
  const { rows: dispositivo } = await pool.query(
    'SELECT cliente_id FROM dispositivos WHERE codigo = $1',
    [dispositivoCodigo]
  );
  if (!dispositivo[0] || dispositivo[0].cliente_id !== clienteId) {
    return { error: 'Dispositivo no encontrado' };
  }

  const notificaciones = notificacionesActivas === undefined ? true : notificacionesActivas;
  await pool.query(
    `INSERT INTO umbrales (dispositivo_codigo, variable, umbral_min, umbral_max, notificaciones_activas)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (dispositivo_codigo, variable)
     DO UPDATE SET umbral_min = $3, umbral_max = $4, notificaciones_activas = $5`,
    [dispositivoCodigo, variable, umbralMin, umbralMax, notificaciones]
  );
  return { ok: true };
}

module.exports = { listar, obtener, crearOActualizar };
