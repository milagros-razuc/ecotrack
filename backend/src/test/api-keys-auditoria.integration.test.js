const assert = require('assert');
const test = require('node:test');
const { createRealtimeFixture } = require('./realtime.test-support');

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL es obligatorio para ejecutar api-keys-auditoria.integration.test.js');
}

let fixture;
let apiKeyId;
let apiKeyName;
let hashClave;

test.before(async () => {
  fixture = await createRealtimeFixture();
  ({ hashClave } = require('../middleware/apiKey'));
});

test.after(async () => {
  if (!fixture) return;
  if (apiKeyId) {
    await fixture.pool.query('DELETE FROM auditoria WHERE entidad = $1 AND entidad_id = $2', [
      'api_key',
      String(apiKeyId),
    ]);
    await fixture.pool.query('DELETE FROM api_keys WHERE id = $1', [apiKeyId]);
  }
  await fixture.close();
});

test('crear y revocar una clave de API registra auditoría sin clave ni hash', async () => {
  apiKeyName = `audit-api-key-${Date.now()}`;
  const baseUrl = `http://127.0.0.1:${fixture.server.address().port}`;
  const headers = {
    Authorization: fixture.signToken(fixture.seed.users.a),
    'Content-Type': 'application/json',
  };

  const createdResponse = await fetch(`${baseUrl}/api/api-keys`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ nombre: apiKeyName }),
  });
  assert.strictEqual(createdResponse.status, 201);
  const created = await createdResponse.json();
  apiKeyId = created.id;
  assert.ok(created.clave);

  const { rows: storedKeys } = await fixture.pool.query(
    'SELECT clave_hash FROM api_keys WHERE id = $1',
    [apiKeyId]
  );
  assert.strictEqual(storedKeys.length, 1);
  const claveHash = storedKeys[0].clave_hash;

  const revokedResponse = await fetch(`${baseUrl}/api/api-keys/${apiKeyId}`, {
    method: 'DELETE',
    headers: { Authorization: headers.Authorization },
  });
  assert.strictEqual(revokedResponse.status, 204);

  const { rows: auditRows } = await fixture.pool.query(
    `SELECT * FROM auditoria
     WHERE cliente_id = $1 AND entidad = 'api_key' AND entidad_id = $2
     ORDER BY id`,
    [fixture.seed.clients.a.id, String(apiKeyId)]
  );
  assert.strictEqual(auditRows.length, 2);
  assert.deepStrictEqual(
    auditRows.map((row) => row.accion),
    ['crear_api_key', 'revocar_api_key']
  );
  for (const row of auditRows) {
    for (const value of Object.values(row)) {
      const text = value == null ? '' : String(value);
      assert.ok(!text.includes(created.clave), `Clave completa en auditoría: ${text}`);
      assert.ok(!text.includes(claveHash), `Hash de clave en auditoría: ${text}`);
      assert.ok(!text.includes(hashClave(created.clave)), `Hash calculado en auditoría: ${text}`);
    }
  }
});
