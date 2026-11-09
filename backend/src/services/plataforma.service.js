const crypto = require('crypto');
const net = require('net');
const pool = require('../config/db');
const dispositivosService = require('./dispositivos.service');
const auditoriaService = require('./auditoria.service');
const { hashFactorySecret } = require('./enrolamiento.service');

const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const RESERVED_USERNAMES = new Set(['platform_admin', 'plataforma', 'root']);
const DEVICE_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEVICE_ID_LENGTH = 12;
const MAX_DEVICE_ID_ATTEMPTS = 5;
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const GENERIC_PROVISIONING_ERROR = 'No se pudieron fabricar los dispositivos';

class PlatformValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlatformValidationError';
  }
}

class PlatformProvisioningError extends Error {
  constructor() {
    super(GENERIC_PROVISIONING_ERROR);
    this.name = 'PlatformProvisioningError';
  }
}

function validServerHost(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (net.isIP(value)) return true;
  if (value.split('.').length === 4 && value.split('.').every((part) => /^\d+$/.test(part))) {
    return false;
  }
  return !/[\r\n]/.test(value) && HOSTNAME_PATTERN.test(value);
}

function generateDeviceId() {
  let suffix = '';
  for (let index = 0; index < DEVICE_ID_LENGTH; index += 1) {
    suffix += DEVICE_ID_ALPHABET[crypto.randomInt(DEVICE_ID_ALPHABET.length)];
  }
  return `ET-${suffix}`;
}

function generateDeviceSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function normalizeClientName(value) {
  return value.trim();
}

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

function isReservedUsername(value) {
  return RESERVED_USERNAMES.has(normalizeUsername(value));
}

function generateTemporaryPassword(length = 20) {
  if (length < 16) {
    throw new Error('La contraseña temporal debe tener al menos 16 caracteres');
  }
  let password = '';
  for (let index = 0; index < length; index += 1) {
    password += TEMPORARY_PASSWORD_ALPHABET[crypto.randomInt(TEMPORARY_PASSWORD_ALPHABET.length)];
  }
  return password;
}

function nvsCsv({ deviceId, deviceSecret, serverHost }) {
  return [
    'key,type,encoding,value',
    'ecotrack,namespace,,',
    'factoryReady,data,u8,1',
    `deviceId,data,string,${deviceId}`,
    `serverHost,data,string,${serverHost}`,
    `deviceSecret,data,string,${deviceSecret}`,
  ].join('\r\n') + '\r\n';
}

async function fabricarDispositivos({ motivo, cantidad, usuario }) {
    const serverHost = process.env.MQTT_PUBLIC_HOST || 'localhost';
    if (!validServerHost(serverHost)) throw new PlatformProvisioningError();

    const client = await pool.connect();
    const items = [];
    try {
      await client.query('BEGIN');
      for (let index = 0; index < cantidad; index += 1) {
        let provisionado = false;
        for (let attempt = 0; attempt < MAX_DEVICE_ID_ATTEMPTS && !provisionado; attempt += 1) {
          const deviceId = generateDeviceId();
          const deviceSecret = generateDeviceSecret();
          const result = await dispositivosService.provisionar({ codigo: deviceId, client });
          if (result.error) continue;

          await client.query(
            `INSERT INTO dispositivos_fabrica (device_id, factory_secret_hash)
             VALUES ($1, $2)`,
            [deviceId, hashFactorySecret(deviceSecret)],
          );
          items.push({
            codigo: deviceId,
            token_reclamo: result.token,
            nvs_csv: nvsCsv({ deviceId, deviceSecret, serverHost }),
          });
          provisionado = true;
        }
        if (!provisionado) throw new PlatformProvisioningError();
      }

      await auditoriaService.registrarEnTransaccion(client, {
        clienteId: usuario.clienteId,
        usuarioId: usuario.sub,
        usuarioUsername: usuario.username,
        actorTipo: 'platform_admin',
        accion: 'fabricar_dispositivos',
        entidad: 'dispositivo',
        entidadId: 'lote',
        detalle: JSON.stringify({ motivo, cantidad: items.length, codigos: items.map((item) => item.codigo) }),
      });
      await client.query('COMMIT');
      return items;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the generic provisioning error.
      }
      if (error instanceof PlatformProvisioningError) throw error;
      throw new PlatformProvisioningError();
    } finally {
      client.release();
    }
}

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
  if (!Number.isInteger(pagina) || pagina < 1) throw new PlatformValidationError('pagina inválida');
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) throw new PlatformValidationError('limite inválido');
  return { pagina, limite, offset: (pagina - 1) * limite };
}

async function listarDispositivos(query = {}, windowDays = 30) {
  const { pagina, limite, offset } = parsePage(query);
  const params = [windowDays, limite, offset];
  const conditions = ['COALESCE(c.es_plataforma, false) = false'];
  if (query.cliente_id !== undefined) {
    const clienteId = Number(query.cliente_id);
    if (!Number.isInteger(clienteId) || clienteId < 1) throw new PlatformValidationError('cliente_id inválido');
    params.push(clienteId);
    conditions.push(`d.cliente_id = $${params.length}`);
  }
  if (query.estado) {
    const stateMap = {
      fabricado: 'fabricado',
      reclamado_sin_enrolar: 'reclamado sin enrolar',
      enrolado: 'enrolado',
    };
    if (!Object.prototype.hasOwnProperty.call(stateMap, query.estado)) {
      throw new PlatformValidationError('estado inválido');
    }
    const state = stateMap[query.estado];
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
       SELECT json_build_object('timestamp', l.timestamp) AS ultima_lectura
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

module.exports = {
  listarDispositivos,
  listarClientes,
  resumen,
  parsePage,
  DEVICE_FIELDS,
  PlatformValidationError,
  PlatformProvisioningError,
  validServerHost,
  generateDeviceId,
  generateDeviceSecret,
  nvsCsv,
  fabricarDispositivos,
  normalizeClientName,
  normalizeUsername,
  isReservedUsername,
  generateTemporaryPassword,
};
