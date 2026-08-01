const pool = require('../config/db');

async function registrar({ dispositivoCodigo, variable, valor, umbralMin, umbralMax }) {
  await pool.query(
    `INSERT INTO alertas (dispositivo_codigo, variable, valor, umbral_min, umbral_max, estado)
     VALUES ($1, $2, $3, $4, $5, 'pendiente')`,
    [dispositivoCodigo, variable, valor, umbralMin, umbralMax]
  );
}

async function listar({ dispositivo, estado, variable, pagina, limite } = {}) {
  const limiteSeguro = Math.min(Math.max(parseInt(limite, 10) || 20, 1), 200);
  const paginaSegura = Math.max(parseInt(pagina, 10) || 1, 1);
  const offset = (paginaSegura - 1) * limiteSeguro;

  const condiciones = [];
  const params = [];

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

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const totalResult = await pool.query(`SELECT COUNT(*) FROM alertas a ${where}`, params);
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

async function actualizarEstado(id, estado) {
  const result = await pool.query(
    `UPDATE alertas SET estado = $1 WHERE id = $2 RETURNING *`,
    [estado, id]
  );
  return result.rows[0] || null;
}

async function distribucionPorVariable({ dispositivo } = {}) {
  const params = [];
  let where = '';
  if (dispositivo) {
    params.push(dispositivo);
    where = 'WHERE dispositivo_codigo = $1';
  }
  const result = await pool.query(
    `SELECT variable, COUNT(*) as cantidad
     FROM alertas
     ${where}
     GROUP BY variable
     ORDER BY cantidad DESC`,
    params
  );
  return result.rows;
}

module.exports = { registrar, listar, actualizarEstado, distribucionPorVariable };