const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const test = require('node:test');
const { withTemporaryMigrationDatabase } = require('./platform-panel.test-support');

const { crearAdminCliente } = require('../../scripts/crear-admin-cliente');

async function withDatabase(context, callback) {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Configure TEST_DATABASE_URL para ejecutar las pruebas de crear-admin-cliente');
    return;
  }

  await withTemporaryMigrationDatabase(async ({ connectionString, runMigrations }) => {
    await runMigrations();
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString });
    try {
      return await callback({ pool });
    } finally {
      await pool.end();
    }
  });
}

async function seedClients(pool, suffix = Date.now()) {
  const { rows } = await pool.query(
    `INSERT INTO clientes (nombre, es_plataforma)
     VALUES ($1, false), ($2, true)
     RETURNING id, nombre, es_plataforma`,
    [`admin_target_${suffix}`, `admin_platform_${suffix}`],
  );
  return {
    target: rows.find((row) => row.es_plataforma === false),
    platform: rows.find((row) => row.es_plataforma === true),
  };
}

test('crea el usuario y la auditoría en la misma transacción', async (context) => {
  await withDatabase(context, async ({ pool }) => {
    const { target } = await seedClients(pool);
    const result = await crearAdminCliente({
      clienteId: target.id,
      username: ' Admin.Transaccional ',
      nombreAdmin: 'Admin Inicial',
      motivo: 'Alta inicial del administrador',
      password: 'UnaPasswordSegura12',
      pool,
    });

    assert.equal(result.username, 'admin.transaccional');
    const user = await pool.query(
      'SELECT id, username, nombre, rol, cliente_id, password_hash FROM usuarios WHERE id = $1',
      [result.id],
    );
    assert.equal(user.rows.length, 1);
    assert.equal(user.rows[0].rol, 'admin');
    assert.equal(user.rows[0].cliente_id, target.id);
    assert.equal(user.rows[0].password_hash.length, 60);
    assert.equal(await bcrypt.compare('UnaPasswordSegura12', user.rows[0].password_hash), true);

    const audit = await pool.query(
      `SELECT actor_tipo, cliente_id, accion, entidad, entidad_id, detalle
       FROM auditoria WHERE entidad_id = $1`,
      [String(result.id)],
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].actor_tipo, 'platform_admin');
    assert.equal(audit.rows[0].cliente_id, target.id);
    assert.match(audit.rows[0].detalle, /admin\.transaccional/);
    assert.match(audit.rows[0].detalle, new RegExp(String(target.id)));
    assert.match(audit.rows[0].detalle, /Alta inicial del administrador/);
  });
});

test('rechaza username duplicado ignorando mayúsculas y no deja basura', async (context) => {
  await withDatabase(context, async ({ pool }) => {
    const { target } = await seedClients(pool);
    await pool.query(
      `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id)
       VALUES ('Duplicado', 'fixture-hash', 'Existente', 'admin', $1)`,
      [target.id],
    );

    await assert.rejects(
      crearAdminCliente({
        clienteId: target.id,
        username: ' DUPLICADO ',
        nombreAdmin: 'Otro Admin',
        motivo: 'Intento duplicado',
        password: 'UnaPasswordSegura12',
        pool,
      }),
      /nombre de usuario ya existe/i,
    );

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM usuarios WHERE lower(username) = 'duplicado'`,
    );
    assert.equal(rows[0].count, 1);
  });
});

test('rechaza cliente inexistente y cliente plataforma', async (context) => {
  await withDatabase(context, async ({ pool }) => {
    const { platform } = await seedClients(pool);
    const input = {
      username: 'admin.invalido',
      nombreAdmin: 'Admin',
      motivo: 'Validación de cliente',
      password: 'UnaPasswordSegura12',
      pool,
    };

    await assert.rejects(
      crearAdminCliente({ ...input, clienteId: 999999 }),
      /cliente no existe/i,
    );
    await assert.rejects(
      crearAdminCliente({ ...input, clienteId: platform.id }),
      /cliente plataforma/i,
    );
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM usuarios WHERE username = 'admin.invalido'`,
    );
    assert.equal(rows[0].count, 0);
  });
});

test('rechaza contraseña corta y username reservado antes de tocar la base', async (context) => {
  await withDatabase(context, async ({ pool }) => {
    const { target } = await seedClients(pool);
    for (const [field, value, expected] of [
      ['password', 'corta', /contraseña.*12/i],
      ['username', ' platform_admin ', /reservado/i],
    ]) {
      await assert.rejects(
        crearAdminCliente({
          clienteId: target.id,
          username: field === 'username' ? value : 'admin.validacion',
          nombreAdmin: 'Admin',
          motivo: 'Validación previa',
          password: field === 'password' ? value : 'UnaPasswordSegura12',
          pool,
        }),
        expected,
      );
    }
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM usuarios WHERE username IN ('admin.validacion', 'platform_admin')`,
    );
    assert.equal(rows[0].count, 0);
  });
});

test('la auditoría no contiene la contraseña ni el hash', async (context) => {
  await withDatabase(context, async ({ pool }) => {
    const { target } = await seedClients(pool);
    const password = 'UnaPasswordSecreta12';
    const result = await crearAdminCliente({
      clienteId: target.id,
      username: 'admin.sinsecretos',
      nombreAdmin: 'Admin',
      motivo: 'Comprobar secretos',
      password,
      pool,
    });
    const { rows: users } = await pool.query('SELECT password_hash FROM usuarios WHERE id = $1', [result.id]);
    const { rows: audits } = await pool.query('SELECT detalle FROM auditoria WHERE entidad_id = $1', [String(result.id)]);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].detalle.includes(password), false);
    assert.equal(audits[0].detalle.includes(users[0].password_hash), false);
  });
});

test('si falla la auditoría hace rollback y no queda el usuario', async (context) => {
  await withDatabase(context, async ({ pool }) => {
    const { target } = await seedClients(pool);
    await assert.rejects(
      crearAdminCliente({
        clienteId: target.id,
        username: 'admin.rollback',
        nombreAdmin: 'Admin',
        motivo: 'Forzar rollback de auditoría',
        password: 'UnaPasswordSegura12',
        pool,
        auditWriter: async () => {
          throw new Error('fallo de auditoría simulado');
        },
      }),
      /auditoría/i,
    );
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM usuarios WHERE username = 'admin.rollback'`,
    );
    assert.equal(rows[0].count, 0);
  });
});
