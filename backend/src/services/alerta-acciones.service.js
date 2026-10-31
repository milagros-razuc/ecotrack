const pool = require('../config/db');

const ACCIONES_VALIDAS = ['generar_alerta', 'marcar_atendida', 'reabrir_alerta'];

async function insertar(client, {
  alertaId,
  clienteId,
  usuarioId = null,
  usuarioUsername,
  accion,
  detalle = null,
  timestamp,
}) {
  if (!ACCIONES_VALIDAS.includes(accion)) {
    throw new Error(`Acción de alerta no válida: ${accion}`);
  }

  const result = await client.query(
    `INSERT INTO alerta_acciones
      (alerta_id, cliente_id, usuario_id, usuario_username, accion, detalle, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
     RETURNING *`,
    [alertaId, clienteId, usuarioId, usuarioUsername, accion, detalle || null, timestamp || null]
  );
  return result.rows[0];
}

async function listar({ alertaId, clienteId } = {}) {
  const result = await pool.query(
    `SELECT aa.*
     FROM alerta_acciones aa
     JOIN alertas a ON a.id = aa.alerta_id AND a.cliente_id = aa.cliente_id
     WHERE aa.alerta_id = $1 AND aa.cliente_id = $2
     UNION ALL
     SELECT NULL::integer AS id, a.id AS alerta_id, a.cliente_id,
            NULL::integer AS usuario_id, 'sistema'::varchar AS usuario_username,
            'generar_alerta'::varchar AS accion,
            'Alerta generada'::text AS detalle, a.timestamp
     FROM alertas a
     WHERE a.id = $1 AND a.cliente_id = $2
       AND NOT EXISTS (
         SELECT 1 FROM alerta_acciones aa
         WHERE aa.alerta_id = a.id
           AND aa.cliente_id = a.cliente_id
           AND aa.accion = 'generar_alerta'
       )
     ORDER BY timestamp ASC NULLS LAST, id ASC NULLS FIRST`,
    [alertaId, clienteId]
  );
  return result.rows;
}

module.exports = { ACCIONES_VALIDAS, insertar, listar };
