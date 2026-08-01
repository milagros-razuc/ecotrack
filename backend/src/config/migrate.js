const bcrypt = require('bcryptjs');
const pool = require('./db');

async function inicializarDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dispositivos (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(50) UNIQUE NOT NULL,
      nombre VARCHAR(100),
      ubicacion VARCHAR(100),
      activo BOOLEAN DEFAULT true,
      creado_en TIMESTAMPTZ DEFAULT NOW(),
      ultima_conexion TIMESTAMPTZ
    )
  `);

  // Por si la tabla ya existía de antes sin esta columna
  await pool.query(`
    ALTER TABLE dispositivos ADD COLUMN IF NOT EXISTS ultima_conexion TIMESTAMPTZ
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lecturas (
      id SERIAL PRIMARY KEY,
      dispositivo_codigo VARCHAR(50),
      temperatura DECIMAL(5,2),
      humedad DECIMAL(5,2),
      luminosidad INTEGER,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (dispositivo_codigo) REFERENCES dispositivos(codigo)
    )
  `);



  await pool.query(`
    CREATE TABLE IF NOT EXISTS alertas (
      id SERIAL PRIMARY KEY,
      dispositivo_codigo VARCHAR(50),
      variable VARCHAR(50),
      valor DECIMAL(5,2),
      umbral_min DECIMAL(5,2),
      umbral_max DECIMAL(5,2),
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // dentro de inicializarDB(), después del CREATE TABLE alertas
await pool.query(`
  ALTER TABLE alertas ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'pendiente'
`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(200) NOT NULL,
      nombre VARCHAR(100),
      creado_en TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS umbrales (
      id SERIAL PRIMARY KEY,
      dispositivo_codigo VARCHAR(50) NOT NULL REFERENCES dispositivos(codigo),
      variable VARCHAR(50) NOT NULL,
      umbral_min DECIMAL(6,2) NOT NULL,
      umbral_max DECIMAL(6,2) NOT NULL,
      UNIQUE (dispositivo_codigo, variable)
    )
  `);

  // dentro de inicializarDB(), después del CREATE TABLE umbrales
await pool.query(`
  ALTER TABLE umbrales ADD COLUMN IF NOT EXISTS notificaciones_activas BOOLEAN DEFAULT true
`);

  await pool.query(`
    INSERT INTO dispositivos (codigo, nombre, ubicacion)
    VALUES ('ESP32-001', 'Nodo Principal', 'Invernadero')
    ON CONFLICT (codigo) DO NOTHING
  `);

  // Umbrales por defecto para ESP32-001, orientativos para un invernadero.
  // Se pueden editar después desde la página de Configuración.
  await pool.query(`
    INSERT INTO umbrales (dispositivo_codigo, variable, umbral_min, umbral_max) VALUES
      ('ESP32-001', 'temperatura', 15, 35),
      ('ESP32-001', 'humedad', 30, 70),
      ('ESP32-001', 'luminosidad', 5, 95)
    ON CONFLICT (dispositivo_codigo, variable) DO NOTHING
  `);

  // Crea el usuario administrador inicial si no existe ninguno todavía,
  // usando las credenciales definidas en el .env (ADMIN_USER / ADMIN_PASS).
  const { rows } = await pool.query('SELECT COUNT(*) FROM usuarios');
  if (parseInt(rows[0].count, 10) === 0) {
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASS || 'admin123';
    const nombre = process.env.ADMIN_NOMBRE || 'Administrador';
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO usuarios (username, password_hash, nombre) VALUES ($1, $2, $3)`,
      [username, hash, nombre]
    );
    console.log(`Usuario admin creado: ${username}`);
  }

  console.log('Base de datos lista');
}

module.exports = inicializarDB;
