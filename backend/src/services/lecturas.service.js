const pool = require('../config/db');

// Ingesta MQTT: no depende de un usuario logueado.
// cliente_id se toma del dueño del dispositivo en este instante (RNF18), de
// modo que el dato histórico no cambia de dueño si el dispositivo se
// transfiere. Si el dispositivo no tiene dueño, la lectura se descarta.
async function guardar({
  dispositivoCodigo,
  temperatura,
  humedad,
  luminosidad,
  timestamp = new Date(),
}) {
  await pool.query(
    `INSERT INTO lecturas
      (dispositivo_codigo, temperatura, humedad, luminosidad, timestamp, cliente_id)
     SELECT d.codigo, $2::numeric, $3::numeric, $4::integer, $5::timestamptz, d.cliente_id
     FROM dispositivos d
     WHERE d.codigo = $1 AND d.cliente_id IS NOT NULL`,
    [dispositivoCodigo, temperatura, humedad, luminosidad, timestamp]
  );
}

function agregarFiltroFechas(condiciones, params, fechaDesde, fechaHasta, alias) {
  if (fechaDesde) {
    params.push(fechaDesde);
    condiciones.push(`${alias}.timestamp >= $${params.length}::date`);
  }
  if (fechaHasta) {
    params.push(fechaHasta);
    condiciones.push(`${alias}.timestamp < ($${params.length}::date + INTERVAL '1 day')`);
  }
}

async function listar({ dispositivo, limite, fechaDesde, fechaHasta, clienteId }) {
  const limiteSeguro = Math.min(Math.max(parseInt(limite, 10) || 100, 1), 1000);

  const condiciones = ['l.cliente_id = $1'];
  const params = [clienteId];

  if (dispositivo) {
    params.push(dispositivo);
    condiciones.push(`l.dispositivo_codigo = $${params.length}`);
  }
  agregarFiltroFechas(condiciones, params, fechaDesde, fechaHasta, 'l');

  const query = `
    SELECT l.*, d.nombre, d.ubicacion
    FROM lecturas l
    LEFT JOIN dispositivos d ON l.dispositivo_codigo = d.codigo
    WHERE ${condiciones.join(' AND ')}
  `;

  const result = await pool.query(`${query} ORDER BY l.timestamp DESC LIMIT ${limiteSeguro}`, params);
  return result.rows;
}

async function ultimaPorDispositivo(clienteId) {
  const result = await pool.query(
    `SELECT DISTINCT ON (l.dispositivo_codigo)
      l.*, d.nombre, d.ubicacion
    FROM lecturas l
    LEFT JOIN dispositivos d ON l.dispositivo_codigo = d.codigo
    WHERE l.cliente_id = $1
    ORDER BY l.dispositivo_codigo, l.timestamp DESC`,
    [clienteId]
  );
  return result.rows;
}

// Series agregadas para la página de Histórico. "dia" agrupa por hora
// (útil para ver el detalle de las últimas 24hs), "semana" y "mes" agrupan
// por día. `periodo` ya viene validado desde la ruta (dia|semana|mes),
// así que es seguro interpolarlo en el SQL de date_trunc.
async function listarAgregado({ dispositivo, periodo, fechaDesde, fechaHasta, clienteId }) {
  const unidadMap = { dia: 'hour', semana: 'day', mes: 'day' };
  const intervaloMap = { dia: '1 day', semana: '7 days', mes: '30 days' };

  const unidad = unidadMap[periodo] || 'day';
  const intervalo = intervaloMap[periodo] || '7 days';

  const params = [clienteId];
  const condiciones = [`l.cliente_id = $1`];
  if (!fechaDesde && !fechaHasta) {
    condiciones.push(`l.timestamp >= NOW() - INTERVAL '${intervalo}'`);
  } else {
    agregarFiltroFechas(condiciones, params, fechaDesde, fechaHasta, 'l');
  }
  if (dispositivo) {
    params.push(dispositivo);
    condiciones.push(`l.dispositivo_codigo = $${params.length}`);
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
       WHERE ${condiciones.join(' AND ')}
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