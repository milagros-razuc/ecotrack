const assert = require('node:assert/strict');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const path = require('node:path');
const { Pool } = require('pg');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const { createRealtimeFixture } = require('./realtime.test-support');
const { withTemporaryMigrationDatabase } = require('./platform-panel.test-support');

const migrationPath = path.resolve(__dirname, '../../migrations/020_client_admin.sql');

function migrationSql() {
  return fs.readFileSync(migrationPath, 'utf8');
}

test('Feature 021: la migración 020 agrega el estado y la unicidad case-insensitive', async () => {
  await withTemporaryMigrationDatabase(async ({ connectionString }) => {
    const pool = new Pool({ connectionString });
    try {
      await pool.query(migrationSql());
      await pool.query(migrationSql());

      const { rows: column } = await pool.query(`
        SELECT is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'usuarios'
          AND column_name = 'must_change_password'
      `);
      assert.deepEqual(column, [{ is_nullable: 'NO', column_default: 'false' }]);

      const { rows: indexes } = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname IN ('uq_clientes_nombre_lower', 'uq_usuarios_username_lower')
        ORDER BY indexname
      `);
      assert.deepEqual(indexes, [
        {
          indexname: 'uq_clientes_nombre_lower',
          indexdef: 'CREATE UNIQUE INDEX uq_clientes_nombre_lower ON public.clientes USING btree (lower((nombre)::text))',
        },
        {
          indexname: 'uq_usuarios_username_lower',
          indexdef: 'CREATE UNIQUE INDEX uq_usuarios_username_lower ON public.usuarios USING btree (lower((username)::text))',
        },
      ]);
    } finally {
      await pool.end();
    }
  });
});

test('Feature 021: la migración 020 aborta ante colisiones históricas sin dejar cambios', async () => {
  await withTemporaryMigrationDatabase(async ({ connectionString }) => {
    const pool = new Pool({ connectionString });
    try {
      const { rows: [cliente] } = await pool.query('SELECT id FROM clientes ORDER BY id LIMIT 1');
      await pool.query('INSERT INTO clientes (nombre) VALUES ($1), ($2)', ['Legacy Client', 'legacy client']);
      await pool.query(
        `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id)
         VALUES ($1, $2, $3, 'admin', $4), ($5, $2, $3, 'admin', $4)`,
        ['LegacyAdmin', 'not-a-secret', 'Legacy Admin', cliente.id, 'legacyadmin'],
      );

      await assert.rejects(pool.query(migrationSql()), /duplicad|collision|colisi/i);

      const { rows: column } = await pool.query(`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'usuarios'
          AND column_name = 'must_change_password'
      `);
      assert.equal(column.length, 0);

      const { rows: indexes } = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname IN ('uq_clientes_nombre_lower', 'uq_usuarios_username_lower')
      `);
      assert.equal(indexes.length, 0);
    } finally {
      await pool.end();
    }
  });
});

let fixture;
let baseUrl;
let platformToken;

test.before(async () => {
  fixture = await createRealtimeFixture();
  baseUrl = `http://127.0.0.1:${fixture.server.address().port}`;
  await fixture.pool.query(
    'UPDATE usuarios SET rol = $1 WHERE id = $2',
    ['platform_admin', fixture.seed.users.a.id],
  );
  platformToken = jwt.sign({
    sub: fixture.seed.users.a.id,
    username: fixture.seed.users.a.username,
    rol: 'platform_admin',
    clienteId: fixture.seed.users.a.cliente_id,
    tv: fixture.seed.users.a.token_version,
  }, 'ecotrack-test-jwt-secret');
});

test.after(async () => {
  await fixture.pool.query('UPDATE usuarios SET rol = $1 WHERE id = $2', ['admin', fixture.seed.users.a.id]);
  await fixture.close();
});

async function postClient(body, token = platformToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = token;
  return fetch(`${baseUrl}/api/plataforma/clientes`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function responseJson(response) {
  return response.json();
}

test('US1: alta real crea cliente y admin con contraseña temporal de entrega única', async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const response = await postClient({
    nombre_cliente: `Acme ${suffix}`,
    username: ` AdminPrincipal_${suffix} `,
    nombre_admin: ' Ana ',
    motivo: 'Alta comercial',
  });
  const body = await responseJson(response);

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(body).sort(), ['cliente', 'password_temporal', 'usuario']);
  assert.match(body.password_temporal, /^[A-HJ-NP-Za-km-z2-9]{20}$/);
  assert.deepEqual(body.usuario, {
    id: body.usuario.id,
    username: `adminprincipal_${suffix}`.toLowerCase(),
    nombre: 'Ana',
    rol: 'admin',
  });

  const { rows: clients } = await fixture.pool.query(
    'SELECT id, nombre, es_plataforma FROM clientes WHERE id = $1',
    [body.cliente.id],
  );
  const { rows: users } = await fixture.pool.query(
    `SELECT id, username, nombre, rol, cliente_id, password_hash, must_change_password
     FROM usuarios WHERE id = $1`,
    [body.usuario.id],
  );
  assert.deepEqual(clients, [{ id: body.cliente.id, nombre: `Acme ${suffix}`, es_plataforma: false }]);
  assert.equal(users.length, 1);
  assert.equal(users[0].username, `adminprincipal_${suffix}`.toLowerCase());
  assert.equal(users[0].nombre, 'Ana');
  assert.equal(users[0].rol, 'admin');
  assert.equal(users[0].cliente_id, body.cliente.id);
  assert.equal(users[0].must_change_password, true);
  assert.notEqual(users[0].password_hash, body.password_temporal);
  assert.equal(await bcrypt.compare(body.password_temporal, users[0].password_hash), true);

  await fixture.pool.query('DELETE FROM usuarios WHERE id = $1', [body.usuario.id]);
  await fixture.pool.query('DELETE FROM clientes WHERE id = $1', [body.cliente.id]);
});

test('US1: el alta exige sesión y rol platform_admin', async () => {
  const body = {
    nombre_cliente: `NoAuth ${Date.now()}`,
    username: `noauth_${Date.now()}`,
    nombre_admin: 'Ana',
    motivo: 'Alta',
  };
  const unauthenticated = await postClient(body, null);
  assert.equal(unauthenticated.status, 401);

  const forbidden = await postClient(body, fixture.signToken(fixture.seed.users.a));
  assert.equal(forbidden.status, 403);
});

test('US1: el alta rechaza username reservado y duplicados con 409', async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const existing = await postClient({
    nombre_cliente: `Existing ${suffix}`,
    username: `existing_${suffix}`,
    nombre_admin: 'Ana',
    motivo: 'Alta',
  });
  assert.equal(existing.status, 201);
  const existingBody = await responseJson(existing);

  const duplicateUsername = await postClient({
    nombre_cliente: `Other ${suffix}`,
    username: `EXISTING_${suffix}`,
    nombre_admin: 'Otra',
    motivo: 'Alta',
  });
  assert.equal(duplicateUsername.status, 409);

  const duplicateName = await postClient({
    nombre_cliente: ` existing ${suffix} `,
    username: `other_${suffix}`,
    nombre_admin: 'Otra',
    motivo: 'Alta',
  });
  assert.equal(duplicateName.status, 409);

  const reserved = await postClient({
    nombre_cliente: `Reserved ${suffix}`,
    username: ' Root ',
    nombre_admin: 'Otra',
    motivo: 'Alta',
  });
  assert.equal(reserved.status, 409);

  await fixture.pool.query('DELETE FROM usuarios WHERE id = $1', [existingBody.usuario.id]);
  await fixture.pool.query('DELETE FROM clientes WHERE id = $1', [existingBody.cliente.id]);
});
