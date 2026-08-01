const pool = require('../config/db');

async function guardar({ dispositivoCodigo, temperatura, humedad, luminosidad }) {
  await pool.query(
    `INSERT INTO lecturas (dispositivo_codigo, temperatura, humedad, luminosidad)
     VALUES ($1, $2, $3, $4)`,
    [dispositivoCodigo, temperatura, humedad, luminosidad]
  );
}

async function listar({ dispositivo, limite }) {
  const limiteSeguro = Math.min(Math.max(parseInt(limite, 10) || 100, 1), 1000);

  let query = `
    SELECT l.*, d.nombre, d.ubicacion 
    FROM lecturas l
    JOIN dispositivos d ON l.dispositivo_codigo = d.codigo
  `;
  const params = [];

  if (dispositivo) {
    query += ` WHERE l.dispositivo_codigo = $1`;
    params.push(dispositivo);
  }

  query += ` ORDER BY l.timestamp DESC LIMIT ${limiteSeguro}`;

  const result = await pool.query(query, params);
  return result.rows;
}

async function ultimaPorDispositivo() {
  const result = await pool.query(`
    SELECT DISTINCT ON (dispositivo_codigo)
      l.*, d.nombre, d.ubicacion
    FROM lecturas l
    JOIN dispositivos d ON l.dispositivo_codigo = d.codigo
    ORDER BY dispositivo_codigo, timestamp DESC
  `);
  return result.rows;
}

// Series agregadas para la página de Histórico. "dia" agrupa por hora
// (útil para ver el detalle de las últimas 24hs), "semana" y "mes" agrupan
// por día. `periodo` ya viene validado desde la ruta (dia|semana|mes),
// así que es seguro interpolarlo en el SQL de date_trunc.
async function listarAgregado({ dispositivo, periodo }) {
  const unidadMap = { dia: 'hour', semana: 'day', mes: 'day' };
  const intervaloMap = { dia: '1 day', semana: '7 days', mes: '30 days' };

  const unidad = unidadMap[periodo] || 'day';
  const intervalo = intervaloMap[periodo] || '7 days';

  const params = [];
  let where = `WHERE timestamp >= NOW() - INTERVAL '${intervalo}'`;
  if (dispositivo) {
    params.push(dispositivo);
    where += ` AND dispositivo_codigo = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT
       date_trunc('${unidad}', timestamp) AS periodo,
       AVG(temperatura)::numeric(5,2) AS temperatura_avg,
       MIN(temperatura)::numeric(5,2) AS temperatura_min,
       MAX(temperatura)::numeric(5,2) AS temperatura_max,
       AVG(humedad)::numeric(5,2) AS humedad_avg,
       MIN(humedad)::numeric(5,2) AS humedad_min,
       MAX(humedad)::numeric(5,2) AS humedad_max,
       AVG(luminosidad)::numeric(8,2) AS luminosidad_avg,
       MAX(luminosidad) AS luminosidad_max
     FROM lecturas
     ${where}
     GROUP BY periodo
     ORDER BY periodo ASC`,
    params
  );
  return result.rows;
}

module.exports = {
  guardar,
  listar,
  ultimaPorDispositivo,
  listarAgregado,
};