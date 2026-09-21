const pool = require('../config/db');

// Ingesta MQTT: no depende de un usuario logueado, no se filtra por cliente.
async function guardar({ dispositivoCodigo, temperatura, humedad, luminosidad }) {
  await pool.query(
    `INSERT INTO lecturas (dispositivo_codigo, temperatura, humedad, luminosidad)
     VALUES ($1, $2, $3, $4)`,
    [dispositivoCodigo, temperatura, humedad, luminosidad]
  );
}

async function listar({ dispositivo, limite, clienteId }) {
  const limiteSeguro = Math.min(Math.max(parseInt(limite, 10) || 100, 1), 1000);

  let query = `
    SELECT l.*, d.nombre, d.ubicacion
    FROM lecturas l
    JOIN dispositivos d ON l.dispositivo_codigo = d.codigo
    WHERE d.cliente_id = $1
  `;
  const params = [clienteId];

  if (dispositivo) {
    params.push(dispositivo);
    query += ` AND l.dispositivo_codigo = $${params.length}`;
  }

  query += ` ORDER BY l.timestamp DESC LIMIT ${limiteSeguro}`;

  const result = await pool.query(query, params);
  return result.rows;
}

async function ultimaPorDispositivo(clienteId) {
  const result = await pool.query(
    `SELECT DISTINCT ON (dispositivo_codigo)
      l.*, d.nombre, d.ubicacion
    FROM lecturas l
    JOIN dispositivos d ON l.dispositivo_codigo = d.codigo
    WHERE d.cliente_id = $1
    ORDER BY dispositivo_codigo, timestamp DESC`,
    [clienteId]
  );
  return result.rows;
}

// Series agregadas para la página de Histórico. "dia" agrupa por hora
// (útil para ver el detalle de las últimas 24hs), "semana" y "mes" agrupan
// por día. `periodo` ya viene validado desde la ruta (dia|semana|mes),
// así que es seguro interpolarlo en el SQL de date_trunc.
async function listarAgregado({ dispositivo, periodo, clienteId }) {
  const unidadMap = { dia: 'hour', semana: 'day', mes: 'day' };
  const intervaloMap = { dia: '1 day', semana: '7 days', mes: '30 days' };

  const unidad = unidadMap[periodo] || 'day';
  const intervalo = intervaloMap[periodo] || '7 days';

  const params = [clienteId];
  let where = `WHERE l.timestamp >= NOW() - INTERVAL '${intervalo}' AND d.cliente_id = $1`;
  if (dispositivo) {
    params.push(dispositivo);
    where += ` AND l.dispositivo_codigo = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT
       date_trunc('${unidad}', l.timestamp) AS periodo,
       AVG(l.temperatura)::numeric(5,2) AS temperatura_avg,
       MIN(l.temperatura)::numeric(5,2) AS temperatura_min,
       MAX(l.temperatura)::numeric(5,2) AS temperatura_max,
       AVG(l.humedad)::numeric(5,2) AS humedad_avg,
       MIN(l.humedad)::numeric(5,2) AS humedad_min,
       MAX(l.humedad)::numeric(5,2) AS humedad_max,
       AVG(l.luminosidad)::numeric(8,2) AS luminosidad_avg,
       MAX(l.luminosidad) AS luminosidad_max
     FROM lecturas l
     JOIN dispositivos d ON l.dispositivo_codigo = d.codigo
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
