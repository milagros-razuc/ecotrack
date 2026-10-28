const crypto = require('crypto');
const pool = require('../config/db');
const auditoriaService = require('./auditoria.service');

function generarTokenReclamo() {
  return crypto.randomBytes(32).toString('hex');
}

function hashTokenReclamo(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

async function provisionar({ codigo, auditoria } = {}) {
  const token = generarTokenReclamo();
  const tokenHash = hashTokenReclamo(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO dispositivos
        (codigo, nombre, ubicacion, activo, cliente_id, token_reclamo_hash, reclamado_en)
       VALUES ($1, NULL, NULL, false, NULL, $2, NULL)
       ON CONFLICT (codigo) DO NOTHING
       RETURNING codigo`,
      [codigo, tokenHash]
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return { error: 'El código de dispositivo ya existe' };
    }
    await client.query('COMMIT');
    if (auditoria) {
      await auditoriaService.registrarOperacionDispositivo({
        ...auditoria,
        accion: 'aprovisionar_dispositivo',
        codigo,
      });
    }
    return { codigo, token };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function rotarToken({ codigo, auditoria } = {}) {
  const token = generarTokenReclamo();
  const tokenHash = hashTokenReclamo(token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE dispositivos
       SET token_reclamo_hash = $2, reclamado_en = NULL
       WHERE codigo = $1 AND cliente_id IS NULL
       RETURNING codigo`,
      [codigo, tokenHash]
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return { error: 'El dispositivo no existe o tiene dueño' };
    }
    await client.query('COMMIT');
    if (auditoria) {
      await auditoriaService.registrarOperacionDispositivo({
        ...auditoria,
        accion: 'rotar_token_dispositivo',
        codigo,
      });
    }
    return { codigo, token };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Da de alta el dispositivo si no existe, y actualiza su última conexión.
// Se llama en cada mensaje MQTT recibido. El dispositivo llega SIN cliente
// asociado (cliente_id queda NULL): permanece "sin asignar" hasta que un
// admin lo reclama para su cliente vía POST /api/dispositivos con el mismo
// código (ver crearOActualizar).
async function registrarConexion(codigo) {
  await pool.query(
    `INSERT INTO dispositivos (codigo, nombre, ubicacion, ultima_conexion)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (codigo)
     DO UPDATE SET ultima_conexion = NOW()`,
    [codigo, `Dispositivo ${codigo}`, 'Sin asignar']
  );
}

// Chequea el estado de "activo" antes de procesar un mensaje MQTT.

async function estaActivo(codigo) {
  const result = await pool.query('SELECT activo FROM dispositivos WHERE codigo = $1', [codigo]);
  if (result.rows.length === 0) return null;
  return result.rows[0].activo;
}

async function obtenerClienteId(codigo) {
  const result = await pool.query(
    'SELECT cliente_id FROM dispositivos WHERE codigo = $1',
    [codigo]
  );
  return result.rows[0]?.cliente_id ?? null;
}

async function listar(clienteId) {
  const result = await pool.query(
    'SELECT * FROM dispositivos WHERE activo = true AND cliente_id = $1 ORDER BY creado_en DESC',
    [clienteId]
  );
  return result.rows;
}

async function listarConEstado(clienteId) {
  const result = await pool.query(
    `SELECT *,
      CASE
        WHEN ultima_conexion IS NULL THEN 'nunca_conectado'
        WHEN ultima_conexion > NOW() - INTERVAL '2 minutes' THEN 'online'
        ELSE 'offline'
      END AS estado
    FROM dispositivos
    WHERE activo = true AND cliente_id = $1
    ORDER BY ultima_conexion DESC NULLS LAST`,
    [clienteId]
  );
  return result.rows;
}

// Da de alta o "reclama" un dispositivo para el cliente del admin logueado.

async function crearOActualizar({ codigo, nombre, ubicacion, clienteId }) {
  const result = await pool.query(
    `INSERT INTO dispositivos (codigo, nombre, ubicacion, activo, cliente_id)
     VALUES ($1, $2, $3, true, $4)
     ON CONFLICT (codigo) DO UPDATE
       SET nombre = $2, ubicacion = $3, activo = true, cliente_id = $4
       WHERE dispositivos.cliente_id IS NULL OR dispositivos.cliente_id = $4
     RETURNING cliente_id`,
    [codigo, nombre, ubicacion, clienteId]
  );

  if (result.rowCount === 0) {
    return { error: 'Ese código de dispositivo ya pertenece a otro cliente' };
  }
  return { ok: true };
}

// Baja lógica transaccional, restringida al cliente dueño del dispositivo:
// libera el dispositivo y elimina sus umbrales sin tocar el histórico.
async function eliminar(codigo, clienteId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE dispositivos
       SET cliente_id = NULL, activo = false, nombre = NULL, ubicacion = NULL
       WHERE codigo = $1 AND cliente_id = $2
       RETURNING codigo`,
      [codigo, clienteId]
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query('DELETE FROM umbrales WHERE dispositivo_codigo = $1', [codigo]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  generarTokenReclamo,
  hashTokenReclamo,
  provisionar,
  rotarToken,
  registrarConexion,
  listar,
  listarConEstado,
  crearOActualizar,
  eliminar,
  estaActivo,
  obtenerClienteId,
};
