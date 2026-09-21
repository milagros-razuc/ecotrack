const pool = require('../config/db');

// Registra una acción administrativa  alta/baja/edición de
// dispositivos, umbrales o usuarios. Se llama DESPUÉS de que la operación
// real ya se confirmó, y a propósito no relanza el error si falla: un
// problema al registrar la auditoría no debe romper la operación
// administrativa que el usuario ya hizo con éxito.
async function registrar({ clienteId, usuarioId, usuarioUsername, accion, entidad, entidadId, detalle }) {
  try {
    await pool.query(
      `INSERT INTO auditoria (cliente_id, usuario_id, usuario_username, accion, entidad, entidad_id, detalle)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [clienteId, usuarioId, usuarioUsername, accion, entidad, entidadId, detalle || null]
    );
  } catch (err) {
    console.error('No se pudo registrar en auditoría:', err.message);
  }
}

async function listar({ clienteId, entidad, accion, pagina, limite, fechaDesde, fechaHasta } = {}) {
  const limiteSeguro = Math.min(Math.max(parseInt(limite, 10) || 20, 1), 200);
  const paginaSegura = Math.max(parseInt(pagina, 10) || 1, 1);
  const offset = (paginaSegura - 1) * limiteSeguro;

  const condiciones = ['cliente_id = $1'];
  const params = [clienteId];

  if (entidad) {
    params.push(entidad);
    condiciones.push(`entidad = $${params.length}`);
  }
  if (accion) {
    params.push(accion);
    condiciones.push(`accion = $${params.length}`);
  }
  if (fechaDesde) {
    params.push(fechaDesde);
    condiciones.push(`timestamp >= $${params.length}::date`);
  }
  if (fechaHasta) {
    params.push(fechaHasta);
    condiciones.push(`timestamp < ($${params.length}::date + INTERVAL '1 day')`);
  }

  const where = `WHERE ${condiciones.join(' AND ')}`;

  const totalResult = await pool.query(`SELECT COUNT(*) FROM auditoria ${where}`, params);
  const total = parseInt(totalResult.rows[0].count, 10);

  const dataParams = [...params, limiteSeguro, offset];
  const dataResult = await pool.query(
    `SELECT * FROM auditoria ${where}
     ORDER BY timestamp DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    data: dataResult.rows,
    total,
    pagina: paginaSegura,
    limite: limiteSeguro,
    totalPaginas: Math.ceil(total / limiteSeguro) || 1,
  };
}

module.exports = { registrar, listar };
