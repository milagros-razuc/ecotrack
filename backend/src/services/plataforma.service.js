const pool = require('../config/db');

const DEVICE_FIELDS = `
  codigo, cliente, nombre, estado, firmware_version, firmware_reported_at,
  ultima_lectura, ultima_conexion, reclamado_en, enrolled_at, online
`;

function lifecycleExpression(alias = 'd', enrolledColumn = `${alias}.enrolled_at`) {
  return `CASE
    WHEN ${alias}.cliente_id IS NULL OR ${alias}.reclamado_en IS NULL THEN 'fabricado'
    WHEN ${enrolledColumn} IS NULL THEN 'reclamado sin enrolar'
    ELSE 'enrolado'
  END`;
}

function onlineExpression(alias = 'd') {
  return `CASE
    WHEN ${alias}.ultima_conexion IS NULL THEN 'offline'
    WHEN ${alias}.ultima_conexion > NOW() - INTERVAL '2 minutes' THEN 'online'
    ELSE 'offline'
  END`;
}

function parsePage(query = {}) {
  const pagina = Number(query.pagina || 1);
  const limite = Number(query.limite || 20);
  if (!Number.isInteger(pagina) || pagina < 1) throw new Error('pagina inválida');
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) throw new Error('limite inválido');
  return { pagina, limite, offset: (pagina - 1) * limite };
}

async function listarDispositivos(query = {}, windowDays = 30) {
  const { pagina, limite, offset } = parsePage(query);
  const params = [windowDays, limite, offset];
  const conditions = ['COALESCE(c.es_plataforma, false) = false'];
  if (query.cliente_id !== undefined) {
    const clienteId = Number(query.cliente_id);
    if (!Number.isInteger(clienteId) || clienteId < 0) throw new Error('cliente_id inválido');
    if (clienteId > 0) {
      params.push(clienteId);
      conditions.push(`d.cliente_id = $${params.length}`);
    }
  }
  if (query.estado) {
    if (!['fabricado', 'reclamado_sin_enrolar', 'enrolado'].includes(query.estado)) {
      throw new Error('estado inválido');
    }
    const state = query.estado.replace('_', ' ');
    params.push(state);
    conditions.push(`${lifecycleExpression('d', 'df.enrolled_at')} = $${params.length}`);
  }
  if (query.firmware) {
    params.push(query.firmware);
    conditions.push(`d.firmware_version = $${params.length}`);
  }

  const where = conditions.join(' AND ');
  const result = await pool.query(
    `WITH pagina AS (
       SELECT d.*, c.nombre AS cliente, df.enrolled_at
       FROM dispositivos d
       LEFT JOIN clientes c ON c.id = d.cliente_id
       LEFT JOIN dispositivos_fabrica df ON df.device_id = d.codigo
       WHERE ${where}
       ORDER BY d.codigo
       LIMIT $2 OFFSET $3
     )
     SELECT p.codigo, p.cliente, p.nombre,
       ${lifecycleExpression('p')} AS estado,
       p.firmware_version, p.firmware_reported_at,
       lectura.ultima_lectura, p.ultima_conexion, p.reclamado_en,
       p.enrolled_at, ${onlineExpression('p')} AS online
     FROM pagina p
     LEFT JOIN LATERAL (
       SELECT json_build_object(
         'timestamp', l.timestamp,
         'temperatura', l.temperatura,
         'humedad', l.humedad,
         'luminosidad', l.luminosidad
       ) AS ultima_lectura
       FROM lecturas l
       WHERE l.dispositivo_codigo = p.codigo
         AND l.timestamp >= NOW() - ($1 * INTERVAL '1 day')
       ORDER BY l.timestamp DESC
       LIMIT 1
     ) lectura ON true
     ORDER BY p.codigo`,
    params,
  );
  return { items: result.rows, pagina, limite };
}

async function listarClientes() {
  const { rows } = await pool.query(`
    SELECT c.id, c.nombre,
      COUNT(d.codigo) FILTER (WHERE ${lifecycleExpression('d', 'df.enrolled_at')} = 'fabricado')::int AS fabricado,
      COUNT(d.codigo) FILTER (WHERE ${lifecycleExpression('d', 'df.enrolled_at')} = 'reclamado sin enrolar')::int AS reclamado_sin_enrolar,
      COUNT(d.codigo) FILTER (WHERE ${lifecycleExpression('d', 'df.enrolled_at')} = 'enrolado')::int AS enrolado
    FROM clientes c
    LEFT JOIN dispositivos d ON d.cliente_id = c.id
    LEFT JOIN dispositivos_fabrica df ON df.device_id = d.codigo
    WHERE c.es_plataforma = false
    GROUP BY c.id, c.nombre
    ORDER BY c.nombre
  `);
  return rows;
}

async function resumen() {
  const [clientsResult, statesResult, firmwareResult] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM clientes WHERE es_plataforma = false'),
    pool.query(`
      SELECT ${lifecycleExpression('d', 'df.enrolled_at')} AS estado, COUNT(*)::int AS total
      FROM dispositivos d
      LEFT JOIN clientes c ON c.id = d.cliente_id
      LEFT JOIN dispositivos_fabrica df ON df.device_id = d.codigo
      WHERE COALESCE(c.es_plataforma, false) = false
      GROUP BY 1
    `),
    pool.query(`
      SELECT d.firmware_version, COUNT(*)::int AS total
      FROM dispositivos d
      LEFT JOIN clientes c ON c.id = d.cliente_id
      WHERE COALESCE(c.es_plataforma, false) = false
        AND d.firmware_version IS NOT NULL
      GROUP BY d.firmware_version
      ORDER BY d.firmware_version
    `),
  ]);
  return {
    clientes: clientsResult.rows[0].total,
    dispositivos_por_estado: Object.fromEntries(
      statesResult.rows.map((row) => [row.estado, row.total]),
    ),
    firmware: Object.fromEntries(
      firmwareResult.rows.map((row) => [row.firmware_version, row.total]),
    ),
  };
}

module.exports = { listarDispositivos, listarClientes, resumen, parsePage, DEVICE_FIELDS };
