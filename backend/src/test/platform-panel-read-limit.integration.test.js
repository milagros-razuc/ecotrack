const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const test = require('node:test');
const { createRealtimeFixture } = require('./realtime.test-support');

const JWT_SECRET = 'ecotrack-test-jwt-secret';
process.env.PLATFORM_READ_RATE_LIMIT_MAX = '1';

let fixture;
let token;

test.before(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  fixture = await createRealtimeFixture();
  await fixture.pool.query(
    'UPDATE usuarios SET rol = $1 WHERE id = $2',
    ['platform_admin', fixture.seed.users.a.id],
  );
  token = jwt.sign({
    sub: fixture.seed.users.a.id,
    username: fixture.seed.users.a.username,
    rol: 'platform_admin',
    clienteId: fixture.seed.users.a.cliente_id,
    tv: fixture.seed.users.a.token_version,
  }, JWT_SECRET);
  assert.equal(jwt.decode(token).rol, 'platform_admin');
});

test.after(async () => {
  await fixture.pool.query('DELETE FROM usuarios WHERE username LIKE $1', ['read_limit_admin_%']);
  await fixture.pool.query('DELETE FROM clientes WHERE nombre LIKE $1', ['read_limit_platform_%']);
  await fixture.close();
  delete process.env.PLATFORM_READ_RATE_LIMIT_MAX;
});

test('el endpoint real de resumen responde 429 al superar el readLimiter', async () => {
  const url = `http://127.0.0.1:${fixture.server.address().port}/api/plataforma/resumen`;
  const headers = { Authorization: token };
  const first = await fetch(url, { headers });
  const second = await fetch(url, { headers });
  assert.equal(first.status, 200, await first.text());
  assert.equal(second.status, 429);
});
