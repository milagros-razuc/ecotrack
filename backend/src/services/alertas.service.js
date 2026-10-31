const pool = require('../config/db');
const alertaAccionesService = require('./alerta-acciones.service');
const { getActiveRegistry } = require('../realtime/socketRegistry');

function emitirAccion(accion) {
  try {
    getActiveRegistry()?.emitToClient(accion.cliente_id, 'alerta-accion', accion);
  } catch (err) {
    console.error('No se pudo emitir la acción de alerta en tiempo real:', err.message);
  }
}

// Generada por el motor de alertas al procesar un mensaje MQTT: no depende
// de un usuario logueado.
// cliente_id se toma del dueño del dispositivo en este instante (RNF18), de
// modo que el dato histórico no cambia de dueño si el dispositivo se
// transfiere. Si el dispositivo no tiene dueño, no se inserta nada.
async function registrar({ dispositivoCodigo, variable, valor, umbralMin, umbralMax }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const alertaResult = await client.query(
      `INSERT INTO alertas
        (dispositivo_codigo, variable, valor, umbral_min, umbral_max, estado, cliente_id)
       SELECT d.codigo, $2::varchar, $3::numeric, $4::numeric, $5::numeric, 'pendiente', d.cliente_id
       FROM dispositivos d
       WHERE d.codigo = $1 AND d.cliente_id IS NOT NULL
       RETURNING *`,
      [dispositivoCodigo, variable, valor, umbralMin, umbralMax]
    );

    if (alertaResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const alerta = alertaResult.rows[0];
    const accion = await alertaAccionesService.insertar(client, {
      alertaId: alerta.id,
      clienteId: alerta.cliente_id,
      usuarioUsername: 'sistema',
      accion: 'generar_alerta',
      detalle: `Alerta generada por ${alerta.variable} fuera de umbral`,
      timestamp: alerta.timestamp,
    });
    await client.query('COMMIT');
    emitirAccion(accion);
    return { alerta, accion };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listar({ dispositivo, estado, variable, pagina, limite, clienteId, fechaDesde, fechaHasta } = {}) {
  const limiteSeguro = Math.min(Math.max(parseInt(limite, 10) || 20, 1), 200);
  const paginaSegura = Math.max(parseInt(pagina, 10) || 1, 1);
  const offset = (paginaSegura - 1) * limiteSeguro;

  const condiciones = ['a.cliente_id = $1'];
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
    `SELECT COUNT(*) FROM alertas a ${where}`,
    params
  );
  const total = parseInt(totalResult.rows[0].count, 10);

  const dataParams = [...params, limiteSeguro, offset];
  const dataResult = await pool.query(
    `SELECT a.*, d.nombre, d.ubicacion
            , ultima.usuario_username AS ultima_accion_usuario
            , ultima.timestamp AS ultima_accion_fecha
     FROM alertas a
     LEFT JOIN dispositivos d ON a.dispositivo_codigo = d.codigo
     LEFT JOIN LATERAL (
       SELECT aa.usuario_username, aa.timestamp
       FROM alerta_acciones aa
       WHERE aa.alerta_id = a.id AND aa.cliente_id = a.cliente_id
       ORDER BY aa.timestamp DESC, aa.id DESC
       LIMIT 1
     ) ultima ON true
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

async function obtenerPorId(id, clienteId) {
  const result = await pool.query(
    `SELECT * FROM alertas
     WHERE id = $1 AND cliente_id = $2`,
    [id, clienteId]
  );
  return result.rows[0] || null;
}

// Solo actualiza si la alerta pertenece al cliente logueado
async function actualizarEstado({ id, estado, clienteId, comentario, usuarioId, usuarioUsername }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actualResult = await client.query(
      `SELECT * FROM alertas
       WHERE id = $1 AND cliente_id = $2
       FOR UPDATE`,
      [id, clienteId]
    );
    if (actualResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const estadoAnterior = actualResult.rows[0].estado;
    if (estadoAnterior === estado) {
      await client.query('ROLLBACK');
      return {
        alerta: actualResult.rows[0],
        auditoria: null,
      };
    }

    const params = [estado, id, clienteId];
    let setComentario = '';
    if (comentario !== undefined) {
      params.push(comentario);
      setComentario = `, comentario = $${params.length}`;
    }
    const result = await client.query(
      `UPDATE alertas SET estado = $1${setComentario}
       WHERE id = $2 AND cliente_id = $3
       RETURNING *`,
      params
    );
    const alerta = result.rows[0];
    const accion = await alertaAccionesService.insertar(client, {
      alertaId: alerta.id,
      clienteId: alerta.cliente_id,
      usuarioId,
      usuarioUsername,
      accion: estado === 'atendida' ? 'marcar_atendida' : 'reabrir_alerta',
      detalle: comentario,
    });
    await client.query('COMMIT');
    emitirAccion(accion);
    return {
      alerta,
      auditoria: {
        estadoAnterior,
        estadoNuevo: estado,
        comentario: comentario ?? null,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function distribucionPorVariable({ dispositivo, clienteId } = {}) {
  const params = [clienteId];
  let where = 'WHERE a.cliente_id = $1';
  if (dispositivo) {
    params.push(dispositivo);
    where += ` AND a.dispositivo_codigo = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT a.variable, COUNT(*) as cantidad
     FROM alertas a
     ${where}
     GROUP BY a.variable
     ORDER BY cantidad DESC`,
    params
  );
  return result.rows;
}

module.exports = { registrar, listar, obtenerPorId, actualizarEstado, distribucionPorVariable };