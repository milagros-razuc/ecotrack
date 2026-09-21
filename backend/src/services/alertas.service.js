const pool = require('../config/db');

// Generada por el motor de alertas al procesar un mensaje MQTT: no depende
// de un usuario logueado, no se filtra por cliente.
async function registrar({ dispositivoCodigo, variable, valor, umbralMin, umbralMax }) {
  await pool.query(
    `INSERT INTO alertas (dispositivo_codigo, variable, valor, umbral_min, umbral_max, estado)
     VALUES ($1, $2, $3, $4, $5, 'pendiente')`,
    [dispositivoCodigo, variable, valor, umbralMin, umbralMax]
  );
}

async function listar({ dispositivo, estado, variable, pagina, limite, clienteId, fechaDesde, fechaHasta } = {}) {
  const limiteSeguro = Math.min(Math.max(parseInt(limite, 10) || 20, 1), 200);
  const paginaSegura = Math.max(parseInt(pagina, 10) || 1, 1);
  const offset = (paginaSegura - 1) * limiteSeguro;

  const condiciones = ['d.cliente_id = $1'];
  const params = [clienteId];

  if (dispositivo) {
    params.push(dispositivo);
    condiciones.push(`a.dispositivo_codigo = $${params.length}`);
  }
  if (estado) {
    params.push(estado);
    condiciones.push(`a.estado = $${params.length}`);
  }
  if (variable) {
    params.push(variable);
    condiciones.push(`a.variable = $${params.length}`);
  }
  // Filtro por rango de fechas para la página de Auditoría. fechaDesde /
  // fechaHasta llegan como 'YYYY-MM-DD'; fechaHasta se toma inclusive
  // (hasta el final de ese día).
  if (fechaDesde) {
    params.push(fechaDesde);
    condiciones.push(`a.timestamp >= $${params.length}::date`);
  }
  if (fechaHasta) {
    params.push(fechaHasta);
    condiciones.push(`a.timestamp < ($${params.length}::date + INTERVAL '1 day')`);
  }

  const where = `WHERE ${condiciones.join(' AND ')}`;

  const totalResult = await pool.query(
    `SELECT COUNT(*) FROM alertas a JOIN dispositivos d ON a.dispositivo_codigo = d.codigo ${where}`,
    params
  );
  const total = parseInt(totalResult.rows[0].count, 10);

  const dataParams = [...params, limiteSeguro, offset];
  const dataResult = await pool.query(
    `SELECT a.*, d.nombre, d.ubicacion
     FROM alertas a
     JOIN dispositivos d ON a.dispositivo_codigo = d.codigo
     ${where}
     ORDER BY a.timestamp DESC
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

// Solo actualiza si la alerta pertenece a un dispositivo del cliente
// logueado
async function actualizarEstado(id, estado, clienteId, comentario) {
  const params = [estado, id, clienteId];
  let setComentario = '';
  if (comentario !== undefined) {
    params.push(comentario);
    setComentario = `, comentario = $${params.length}`;
  }
  const result = await pool.query(
    `UPDATE alertas a SET estado = $1${setComentario}
     FROM dispositivos d
     WHERE a.id = $2 AND a.dispositivo_codigo = d.codigo AND d.cliente_id = $3
     RETURNING a.*`,
    params
  );
  return result.rows[0] || null;
}

async function distribucionPorVariable({ dispositivo, clienteId } = {}) {
  const params = [clienteId];
  let where = 'WHERE d.cliente_id = $1';
  if (dispositivo) {
    params.push(dispositivo);
    where += ` AND a.dispositivo_codigo = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT a.variable, COUNT(*) as cantidad
     FROM alertas a
     JOIN dispositivos d ON a.dispositivo_codigo = d.codigo
     ${where}
     GROUP BY a.variable
     ORDER BY cantidad DESC`,
    params
  );
  return result.rows;
}

module.exports = { registrar, listar, actualizarEstado, distribucionPorVariable };
