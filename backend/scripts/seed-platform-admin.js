require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { validateDatabaseConfig } = require('./run-migrations');

async function seedPlatformAdmin({
  pool: providedPool,
  poolFactory = (config) => new Pool(config),
  environment = process.env,
  allowNonTestDatabase = false,
} = {}) {
  const databaseConfig = validateDatabaseConfig(environment, { allowNonTestDatabase });
  const username = environment.PLATFORM_ADMIN_USER || 'platform_admin';
  const password = environment.PLATFORM_ADMIN_PASS;
  if (!password || password.trim().length < 12) {
    throw new Error('PLATFORM_ADMIN_PASS es obligatorio y debe tener al menos 12 caracteres');
  }
  const pool = providedPool || poolFactory(databaseConfig);

  try {
    await pool.query('BEGIN');
    const clientResult = await pool.query(
      'SELECT id, es_plataforma FROM clientes WHERE nombre = $1 FOR UPDATE',
      ['plataforma'],
    );
    let clientId;
    if (clientResult.rows.length > 0) {
      if (clientResult.rows[0].es_plataforma !== true) {
        throw new Error('El cliente plataforma existe pero no está marcado como plataforma');
      }
      clientId = clientResult.rows[0].id;
    } else {
      const insertedClient = await pool.query(
        `INSERT INTO clientes (nombre, es_plataforma)
         VALUES ('plataforma', true) RETURNING id`,
      );
      clientId = insertedClient.rows[0].id;
    }

    const userResult = await pool.query(
      'SELECT id, rol, cliente_id FROM usuarios WHERE username = $1 FOR UPDATE',
      [username],
    );
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      if (user.rol !== 'platform_admin' || user.cliente_id !== clientId) {
        throw new Error('El username ya existe con una identidad incompatible');
      }
    } else {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id)
         VALUES ($1, $2, 'Administración de la plataforma', 'platform_admin', $3)`,
        [username, hash, clientId],
      );
    }
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    if (!providedPool) await pool.end();
  }
}

if (require.main === module) {
  seedPlatformAdmin({ allowNonTestDatabase: process.argv.includes('--allow-non-test-db') || process.env.ALLOW_NON_TEST_DB === '1' }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { seedPlatformAdmin };
