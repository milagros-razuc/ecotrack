const pool = require('../config/db');

// Da de alta el dispositivo si no existe, y actualiza su última conexión.
// Se llama en cada mensaje MQTT recibido.
async function registrarConexion(codigo) {
  await pool.query(
    `INSERT INTO dispositivos (codigo, nombre, ubicacion, ultima_conexion)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (codigo)
     DO UPDATE SET ultima_conexion = NOW()`,
    [codigo, `Dispositivo ${codigo}`, 'Sin asignar']
  );
}

async function listar() {
  const result = await pool.query('SELECT * FROM dispositivos ORDER BY creado_en DESC');
  return result.rows;
}

async function listarConEstado() {
  const result = await pool.query(`
    SELECT *,
      CASE
        WHEN ultima_conexion IS NULL THEN 'nunca_conectado'
        WHEN ultima_conexion > NOW() - INTERVAL '2 minutes' THEN 'online'
        ELSE 'offline'
      END AS estado
    FROM dispositivos
    ORDER BY ultima_conexion DESC NULLS LAST
  `);
  return result.rows;
}

async function crearOActualizar({ codigo, nombre, ubicacion }) {
  await pool.query(
    `INSERT INTO dispositivos (codigo, nombre, ubicacion) VALUES ($1, $2, $3)
     ON CONFLICT (codigo) DO UPDATE SET nombre = $2, ubicacion = $3`,
    [codigo, nombre, ubicacion]
  );
}

module.exports = {
  registrarConexion,
  listar,
  listarConEstado,
  crearOActualizar,
};
