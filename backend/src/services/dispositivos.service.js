const pool = require('../config/db');

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
  const { rows: existente } = await pool.query(
    'SELECT cliente_id FROM dispositivos WHERE codigo = $1',
    [codigo]
  );
  if (existente[0] && existente[0].cliente_id !== null && existente[0].cliente_id !== clienteId) {
    return { error: 'Ese código de dispositivo ya pertenece a otro cliente' };
  }

  await pool.query(
    `INSERT INTO dispositivos (codigo, nombre, ubicacion, activo, cliente_id) VALUES ($1, $2, $3, true, $4)
     ON CONFLICT (codigo) DO UPDATE SET nombre = $2, ubicacion = $3, activo = true, cliente_id = $4`,
    [codigo, nombre, ubicacion, clienteId]
  );
  return { ok: true };
}

// Baja lógica , restringida al cliente dueño del dispositivo: no
// afecta la fila si el código pertenece a otro cliente.
async function eliminar(codigo, clienteId) {
  const result = await pool.query(
    `UPDATE dispositivos SET activo = false WHERE codigo = $1 AND cliente_id = $2 RETURNING codigo`,
    [codigo, clienteId]
  );
  return result.rows[0] || null;
}

module.exports = {
  registrarConexion,
  listar,
  listarConEstado,
  crearOActualizar,
  eliminar,
  estaActivo,
};
