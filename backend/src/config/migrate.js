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

  // ── Lecturas: tabla particionada por rango de timestamp (4.5.4) ────────
  // Postgres exige que la columna de particionado (timestamp) forme parte
  // de la clave primaria; por eso la PK es compuesta (id, timestamp) en
  // vez de solo "id". La unicidad de "id" sigue garantizada porque proviene
  // de una única secuencia (SERIAL) compartida por todas las particiones.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lecturas (
      id SERIAL,
      dispositivo_codigo VARCHAR(50) REFERENCES dispositivos(codigo),
      temperatura DECIMAL(5,2),
      humedad DECIMAL(5,2),
      luminosidad INTEGER,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (id, timestamp)
    ) PARTITION BY RANGE (timestamp)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lecturas_dispositivo_ts
      ON lecturas (dispositivo_codigo, timestamp DESC)
  `);
  // ────────────────────────────────────────────────────────────────────────

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alertas (
      id SERIAL PRIMARY KEY,
      dispositivo_codigo VARCHAR(50),
      variable VARCHAR(50),
      valor DECIMAL(5,2),
      umbral_min DECIMAL(5,2),
      umbral_max DECIMAL(5,2),
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      estado VARCHAR(20) DEFAULT 'pendiente',
      comentario TEXT
    )
  `);
  
  await pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'fk_alertas_dispositivo'
    ) THEN
      ALTER TABLE alertas ADD CONSTRAINT fk_alertas_dispositivo
        FOREIGN KEY (dispositivo_codigo) REFERENCES dispositivos(codigo);
    END IF;
  END $$;
`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_alertas_dispositivo_estado
      ON alertas (dispositivo_codigo, estado)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(200) NOT NULL,
      nombre VARCHAR(100),
      rol VARCHAR(20) NOT NULL DEFAULT 'comun',
      creado_en TIMESTAMPTZ DEFAULT NOW(),
      token_version INTEGER NOT NULL DEFAULT 1
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS umbrales (
      id SERIAL PRIMARY KEY,
      dispositivo_codigo VARCHAR(50) NOT NULL REFERENCES dispositivos(codigo),
      variable VARCHAR(50) NOT NULL,
      umbral_min DECIMAL(6,2) NOT NULL,
      umbral_max DECIMAL(6,2) NOT NULL,
      notificaciones_activas BOOLEAN DEFAULT true,
      UNIQUE (dispositivo_codigo, variable)
    )
  `);

  // ── Modelo multi-cliente ────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) UNIQUE NOT NULL,
      activo BOOLEAN DEFAULT true,
      creado_en TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE dispositivos ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)
  `);
  await pool.query(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)
  `);

  const { rows: clientesExistentes } = await pool.query('SELECT id FROM clientes ORDER BY id ASC LIMIT 1');
  let clienteDefaultId;
  if (clientesExistentes.length === 0) {
    const nombreClienteDefault = process.env.CLIENTE_DEFAULT_NOMBRE || 'Cliente Principal';
    const { rows: nuevoCliente } = await pool.query(
      `INSERT INTO clientes (nombre) VALUES ($1) RETURNING id`,
      [nombreClienteDefault]
    );
    clienteDefaultId = nuevoCliente[0].id;
    console.log(`Cliente por defecto creado: ${nombreClienteDefault} (id: ${clienteDefaultId})`);
  } else {
    clienteDefaultId = clientesExistentes[0].id;
  }

  await pool.query('UPDATE dispositivos SET cliente_id = $1 WHERE cliente_id IS NULL', [clienteDefaultId]);
  await pool.query('UPDATE usuarios SET cliente_id = $1 WHERE cliente_id IS NULL', [clienteDefaultId]);

  await pool.query('ALTER TABLE usuarios ALTER COLUMN cliente_id SET NOT NULL');

  await pool.query('CREATE INDEX IF NOT EXISTS idx_dispositivos_cliente ON dispositivos(cliente_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_usuarios_cliente ON usuarios(cliente_id)');
  // ────────────────────────────────────────────────────────────────────────

  // ── Log de auditoría ─────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      usuario_username VARCHAR(50),
      accion VARCHAR(50) NOT NULL,
      entidad VARCHAR(50) NOT NULL,
      entidad_id VARCHAR(100),
      detalle TEXT,
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_auditoria_cliente_fecha
      ON auditoria (cliente_id, timestamp DESC)
  `);
  // ────────────────────────────────────────────────────────────────────────

  // ── API pública (RF19/RI20) ──────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      nombre VARCHAR(100) NOT NULL,
      clave_hash VARCHAR(64) NOT NULL UNIQUE,
      prefijo VARCHAR(12) NOT NULL,
      activa BOOLEAN DEFAULT true,
      creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      creado_en TIMESTAMPTZ DEFAULT NOW(),
      ultimo_uso TIMESTAMPTZ,
      revocada_en TIMESTAMPTZ
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_cliente ON api_keys(cliente_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(clave_hash)');
  // ────────────────────────────────────────────────────────────────────────

  // ── Particiones mensuales de "lecturas" ─────────────────────────────────
  // Se asegura la partición del mes actual y del siguiente en cada arranque,
  // para que nunca falte una al llegar una lectura por MQTT. Idempotente:
  // CREATE TABLE IF NOT EXISTS no falla si la partición ya existe.
  async function asegurarParticionMensual(fecha) {
    const anio = fecha.getUTCFullYear();
    const mes = fecha.getUTCMonth(); // 0-indexado
    const inicio = new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 10);
    const fin = new Date(Date.UTC(anio, mes + 1, 1)).toISOString().slice(0, 10);
    const nombre = `lecturas_${anio}_${String(mes + 1).padStart(2, '0')}`;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${nombre} PARTITION OF lecturas
        FOR VALUES FROM ('${inicio}') TO ('${fin}')
    `);
  }

  const ahora = new Date();
  const proximoMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1));
  await asegurarParticionMensual(ahora);
  await asegurarParticionMensual(proximoMes);
  console.log('Particiones de "lecturas" verificadas (mes actual + siguiente).');
  // ────────────────────────────────────────────────────────────────────────

  await pool.query(`
    INSERT INTO dispositivos (codigo, nombre, ubicacion, cliente_id)
    VALUES ('ESP32-001', 'Nodo Principal', 'Invernadero', $1)
    ON CONFLICT (codigo) DO NOTHING
  `, [clienteDefaultId]);

  await pool.query(`
    INSERT INTO umbrales (dispositivo_codigo, variable, umbral_min, umbral_max) VALUES
      ('ESP32-001', 'temperatura', 15, 35),
      ('ESP32-001', 'humedad', 30, 70),
      ('ESP32-001', 'luminosidad', 5, 95)
    ON CONFLICT (dispositivo_codigo, variable) DO NOTHING
  `);

  const { rows: admins } = await pool.query(`SELECT COUNT(*) FROM usuarios WHERE rol = 'admin'`);
  const { rows: totalUsuarios } = await pool.query('SELECT COUNT(*) FROM usuarios');
  if (parseInt(admins[0].count, 10) === 0 && parseInt(totalUsuarios[0].count, 10) > 0) {
    await pool.query(`
      UPDATE usuarios SET rol = 'admin'
      WHERE id = (SELECT id FROM usuarios ORDER BY creado_en ASC, id ASC LIMIT 1)
    `);
    console.log('Ningún usuario tenía rol admin: se promovió al usuario más antiguo.');
  }

  const { rows } = await pool.query('SELECT COUNT(*) FROM usuarios');
  if (parseInt(rows[0].count, 10) === 0) {
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASS || 'admin123';
    const nombre = process.env.ADMIN_NOMBRE || 'AdministradorR';
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id) VALUES ($1, $2, $3, 'admin', $4)`,
      [username, hash, nombre, clienteDefaultId]
    );
    console.log(`Usuario admin creado: ${username} (rol: admin, cliente: ${clienteDefaultId})`);
  }

  const usernameTest = process.env.TEST_USER || 'operario1';
  const { rows: existeTest } = await pool.query(
    'SELECT id FROM usuarios WHERE username = $1',
    [usernameTest]
  );
  if (existeTest.length === 0) {
    const passwordTest = process.env.TEST_USER_PASS || 'operario123';
    const nombreTest = process.env.TEST_USER_NOMBRE || 'Usuario de Prueba';
    const hashTest = await bcrypt.hash(passwordTest, 10);

    await pool.query(
      `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id) VALUES ($1, $2, $3, 'comun', $4)`,
      [usernameTest, hashTest, nombreTest, clienteDefaultId]
    );
    console.log(`Usuario de prueba creado: ${usernameTest} (rol: comun, cliente: ${clienteDefaultId})`);
  }

  console.log('Base de datos lista');
}

module.exports = inicializarDB;