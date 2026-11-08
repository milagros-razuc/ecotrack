const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { seedPlatformAdmin } = require('../../scripts/seed-platform-admin');

const seedPath = path.resolve(__dirname, '../../scripts/seed-platform-admin.js');
const environment = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '5433',
  DB_NAME: 'hardening_seed_test',
  DB_USER: 'test',
  DB_PASS: 'test',
  PLATFORM_ADMIN_USER: 'platform_admin',
  PLATFORM_ADMIN_PASS: 'una-clave-de-12',
};

function fakePool({ client = null, user = null } = {}) {
  const state = {
    client,
    user,
    insertedClients: 0,
    insertedUsers: 0,
    queries: [],
  };
  return {
    state,
    async query(sql, params = []) {
      state.queries.push([sql, params]);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.startsWith('SELECT id, es_plataforma')) return { rows: state.client ? [state.client] : [] };
      if (sql.startsWith('INSERT INTO clientes')) {
        state.insertedClients += 1;
        state.client = { id: 1, es_plataforma: true };
        return { rows: [state.client] };
      }
      if (sql.startsWith('SELECT id, rol, cliente_id')) return { rows: state.user ? [state.user] : [] };
      if (sql.startsWith('INSERT INTO usuarios')) {
        state.insertedUsers += 1;
        state.user = { id: 2, rol: 'platform_admin', cliente_id: 1 };
        return { rows: [] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    },
  };
}

test('el seed valida la base y exige una clave mínima de 12 caracteres', async () => {
  let poolCreated = false;
  await assert.rejects(
    seedPlatformAdmin({
      environment: { ...environment, PLATFORM_ADMIN_PASS: 'corta' },
      poolFactory: () => {
        poolCreated = true;
        return fakePool();
      },
    }),
    /al menos 12/,
  );
  assert.equal(poolCreated, false);
  await assert.rejects(
    seedPlatformAdmin({
      pool: fakePool(),
      environment: { ...environment, DB_NAME: 'ecotrack' },
    }),
    /DB_NAME inválido/,
  );
});

test('el seed es idempotente y crea un cliente y usuario una sola vez', async () => {
  const pool = fakePool();
  await seedPlatformAdmin({ pool, environment });
  await seedPlatformAdmin({ pool, environment });
  assert.equal(pool.state.insertedClients, 1);
  assert.equal(pool.state.insertedUsers, 1);
});

test('el seed nunca imprime ni contiene la clave en su salida', async () => {
  const source = fs.readFileSync(seedPath, 'utf8');
  assert.doesNotMatch(source, /console\.(log|info)\([^)]*PLATFORM_ADMIN_PASS/i);
  assert.doesNotMatch(source, /una-clave-de-12/);
});

test('el seed no corrige un cliente desmarcado ni asciende o mueve usuarios existentes', async () => {
  await assert.rejects(
    seedPlatformAdmin({ pool: fakePool({ client: { id: 1, es_plataforma: false } }), environment }),
    /no está marcado/,
  );
  await assert.rejects(
    seedPlatformAdmin({
      pool: fakePool({ client: { id: 1, es_plataforma: true }, user: { id: 2, rol: 'admin', cliente_id: 1 } }),
      environment,
    }),
    /identidad incompatible/,
  );
});
