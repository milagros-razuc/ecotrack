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

  await pool.query(`
    ALTER TABLE alertas
    ADD CONSTRAINT fk_alertas_dispositivo
    FOREIGN KEY (dispositivo_codigo) REFERENCES dispositivos(codigo);
  `);

  // dentro de inicializarDB(), después del CREATE TABLE alertas
  await pool.query(`
    ALTER TABLE alertas ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'pendiente'
    
  `);

  // comentario libre que deja quien atiende la alerta.
  await pool.query(`
    ALTER TABLE alertas ADD COLUMN IF NOT EXISTS comentario TEXT
  `);

  

  

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(200) NOT NULL,
      nombre VARCHAR(100),
      rol VARCHAR(20) NOT NULL DEFAULT 'comun',
      creado_en TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Por si la tabla ya existía de antes sin esta columna
  await pool.query(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'comun'
  `);

  await pool.query(`
  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1
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

  // ── Modelo multi-cliente ────────────────────────────────────────────────
  // Tabla clientes: cada organización que usa la plataforma es un cliente.
  // dispositivos y usuarios quedan atados a un cliente_id, y todas las
  // queries de los servicios deben filtrar por el cliente_id del token.
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

  // Si no existe ningún cliente todavía, creamos uno por defecto para no
  // dejar huérfanos los dispositivos/usuarios que ya existían
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

  // Backfill: cualquier dispositivo/usuario que haya quedado sin cliente_id
  await pool.query('UPDATE dispositivos SET cliente_id = $1 WHERE cliente_id IS NULL', [clienteDefaultId]);
  await pool.query('UPDATE usuarios SET cliente_id = $1 WHERE cliente_id IS NULL', [clienteDefaultId]);

  // usuarios.cliente_id es obligatorio: todo usuario se crea siempre dentro
  // del contexto de un cliente. dispositivos.cliente_id, en cambio, se deja
  // NULLABLE a propósito: un dispositivo nuevo llega por MQTT sin saber a
  // qué cliente pertenece (registrarConexion lo inserta "sin asignar") y
  // queda así hasta que un admin lo reclama con POST /api/dispositivos.
  await pool.query('ALTER TABLE usuarios ALTER COLUMN cliente_id SET NOT NULL');

  await pool.query('CREATE INDEX IF NOT EXISTS idx_dispositivos_cliente ON dispositivos(cliente_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_usuarios_cliente ON usuarios(cliente_id)');
  // ────────────────────────────────────────────────────────────────────────

  // ── Log de auditoría ─────────────────────────────────────────────
  // Registra acciones administrativas (alta/baja/edición de dispositivos,
  // umbrales y usuarios), separado del log de alertas que ya existe.

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

  await pool.query('CREATE INDEX IF NOT EXISTS idx_auditoria_cliente ON auditoria(cliente_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_auditoria_timestamp ON auditoria(timestamp DESC)');
  // ────────────────────────────────────────────────────────────────────────

  // ── API pública (RF19/RI20) ──────────────────────────────────────────
  // Claves de API para consumo externo de solo lectura, independientes de
  // las credenciales del dashboard. Un cliente puede tener varias claves
  // (una por integración: Grafana, un script de reportes, etc.), así se
  // puede revocar una sin tumbar las demás — mitigación de riesgo prevista
  // en 3.6 ("revocación inmediata de claves").
  //
  // Solo se guarda el hash SHA-256 de la clave (64 hex chars), nunca la
  // clave en texto plano: no hace falta el salteo lento de bcrypt porque
  // no es una contraseña de humano, son 256 bits random no adivinables por
  // diccionario, y el hash exacto permite buscar por índice en O(1) al
  // validar cada request (bcrypt no lo permite, hay que probar contra cada
  // hash guardado). La clave completa se muestra una sola vez al crearla;
  // si se pierde, no hay forma de recuperarla, solo revocar y generar otra.
  //
  // `prefijo` guarda los primeros caracteres SIN hashear (ej. "eco_a1b2c3"),
  // solo para que el admin pueda identificar la clave en la lista sin
  // tener que exponer ni poder reconstruir el resto.
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
  // El middleware busca por clave_hash en cada request público; ya es
  // UNIQUE (índice automático), pero lo dejamos explícito para que quede
  // documentado que es el camino de búsqueda caliente.
  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(clave_hash)');
  // ────────────────────────────────────────────────────────────────────────

  await pool.query(`
    INSERT INTO dispositivos (codigo, nombre, ubicacion, cliente_id)
    VALUES ('ESP32-001', 'Nodo Principal', 'Invernadero', $1)
    ON CONFLICT (codigo) DO NOTHING
  `, [clienteDefaultId]);

  // Umbrales por defecto para ESP32-001, orientativos para un invernadero.
  await pool.query(`
    INSERT INTO umbrales (dispositivo_codigo, variable, umbral_min, umbral_max) VALUES
      ('ESP32-001', 'temperatura', 15, 35),
      ('ESP32-001', 'humedad', 30, 70),
      ('ESP32-001', 'luminosidad', 5, 95)
    ON CONFLICT (dispositivo_codigo, variable) DO NOTHING
  `);

  // Si la tabla usuarios ya existía de antes de agregar la columna rol,
  // el ALTER TABLE anterior le puso 'comun' a todos por defecto.
  
  const { rows: admins } = await pool.query(`SELECT COUNT(*) FROM usuarios WHERE rol = 'admin'`);
  const { rows: totalUsuarios } = await pool.query('SELECT COUNT(*) FROM usuarios');
  if (parseInt(admins[0].count, 10) === 0 && parseInt(totalUsuarios[0].count, 10) > 0) {
    await pool.query(`
      UPDATE usuarios SET rol = 'admin'
      WHERE id = (SELECT id FROM usuarios ORDER BY creado_en ASC, id ASC LIMIT 1)
    `);
    console.log('Ningún usuario tenía rol admin: se promovió al usuario más antiguo.');
  }

  // Crea el usuario administrador inicial si no existe ninguno todavía,
  // usando las credenciales definidas en el .env (ADMIN_USER / ADMIN_PASS).
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

  // Usuario común de prueba, solo para tener un segundo perfil con el que
  // validar que las restricciones 
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
