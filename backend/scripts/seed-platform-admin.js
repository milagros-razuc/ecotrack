require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function seedPlatformAdmin() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
  });
  const username = process.env.PLATFORM_ADMIN_USER || 'platform_admin';
  const password = process.env.PLATFORM_ADMIN_PASS;
  if (!password || password.trim().length < 6) {
    throw new Error('PLATFORM_ADMIN_PASS es obligatorio y debe tener al menos 6 caracteres');
  }

  try {
    await pool.query('BEGIN');
    const clientResult = await pool.query(
      `INSERT INTO clientes (nombre, es_plataforma)
       VALUES ('plataforma', true)
       ON CONFLICT (nombre) DO UPDATE SET es_plataforma = true
       RETURNING id`,
    );
    const clientId = clientResult.rows[0].id;
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id)
       VALUES ($1, $2, 'Administración de la plataforma', 'platform_admin', $3)
       ON CONFLICT (username) DO UPDATE
       SET rol = 'platform_admin', cliente_id = EXCLUDED.cliente_id`,
      [username, hash, clientId],
    );
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seedPlatformAdmin().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { seedPlatformAdmin };
