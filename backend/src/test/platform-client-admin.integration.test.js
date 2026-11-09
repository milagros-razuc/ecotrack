const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const test = require('node:test');
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
