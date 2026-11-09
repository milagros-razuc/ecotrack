const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const test = require('node:test');

const { createRealtimeFixture } = require('./realtime.test-support');

const JWT_SECRET = 'ecotrack-test-jwt-secret';

let fixture;
let baseUrl;
let platformToken;
let createClientAdminLimiter;
let resetClientAdminRateLimit;

function tokenFor(user, role = user.rol) {
  return jwt.sign({
    sub: user.id,
    username: user.username,
    rol: role,
    clienteId: user.cliente_id,
    tv: user.token_version,
  }, JWT_SECRET);
}

function request(body, token = platformToken) {
  return fetch(`${baseUrl}/api/plataforma/clientes`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function validBody(suffix) {
  return {
    nombre_cliente: `Rate Client ${suffix}`,
    username: `rate_admin_${suffix}`,
    nombre_admin: 'Rate Admin',
    motivo: 'Rate limit test',
  };
}

test.before(async () => {
  fixture = await createRealtimeFixture();
  ({
    createClientAdminLimiter,
    resetClientAdminRateLimit,
  } = require('../routes/plataforma'));
  baseUrl = `http://127.0.0.1:${fixture.server.address().port}`;
  await fixture.pool.query(
    'UPDATE usuarios SET rol = $1 WHERE id = $2',
    ['platform_admin', fixture.seed.users.a.id],
  );
  platformToken = tokenFor(fixture.seed.users.a, 'platform_admin');
  resetClientAdminRateLimit();
});

test.after(async () => {
  if (resetClientAdminRateLimit) await resetClientAdminRateLimit();
  if (!fixture) return;
  await fixture.pool.query(
    'UPDATE usuarios SET rol = $1 WHERE id = $2',
    ['admin', fixture.seed.users.a.id],
  );
  await fixture.close();
});

test('el alta permite cinco solicitudes y rechaza la sexta con Retry-After', async () => {
  resetClientAdminRateLimit();
  const suffix = Date.now();
  const responses = [];
  for (let index = 0; index < 6; index += 1) {
    responses.push(await request(validBody(`${suffix}_${index}`)));
  }

  assert.deepEqual(responses.slice(0, 5).map((response) => response.status), [201, 201, 201, 201, 201]);
  assert.equal(responses[5].status, 429);
  assert.ok(Number(responses[5].headers.get('retry-after')) > 0);
  assert.deepEqual(await responses[5].json(), { error: 'Límite de solicitudes excedido.' });
});

test('el 429 no crea cliente, usuario ni auditoría', async () => {
  resetClientAdminRateLimit();
  const suffix = `rejected_${Date.now()}`;
  for (let index = 0; index < 5; index += 1) {
    const response = await request(validBody(`${suffix}_${index}`));
    assert.equal(response.status, 201);
  }
  const countRows = async () => {
    const { rows } = await fixture.pool.query(
      `SELECT
         (SELECT COUNT(*) FROM clientes WHERE nombre LIKE $1)::int AS clientes,
         (SELECT COUNT(*) FROM usuarios WHERE username LIKE $2)::int AS usuarios,
         (SELECT COUNT(*) FROM auditoria WHERE detalle LIKE $3)::int AS auditoria`,
      [`Rate Client ${suffix}%`, `rate_admin_${suffix}%`, `%Rate Client ${suffix}%`],
    );
    return rows[0];
  };
  const before = await countRows();
  const rejectedBody = validBody(suffix);
  const response = await request(rejectedBody);
  assert.equal(response.status, 429);

  assert.deepEqual(await countRows(), before);
});

test('el contador es por usuario y no limita a otro platform_admin', async () => {
  resetClientAdminRateLimit();
  await fixture.pool.query(
    'UPDATE usuarios SET rol = $1 WHERE id = $2',
    ['platform_admin', fixture.seed.users.b.id],
  );
  const otherToken = tokenFor(fixture.seed.users.b, 'platform_admin');
  const suffix = `other_${Date.now()}`;
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await request(validBody(`first_${suffix}_${index}`))).status, 201);
  }
  assert.equal((await request(validBody(`first_${suffix}_blocked`))).status, 429);
  assert.equal((await request(validBody(`second_${suffix}`), otherToken)).status, 201);
});

test('los intentos 400 y 409 consumen cupo', async () => {
  resetClientAdminRateLimit();
  for (let index = 0; index < 5; index += 1) {
    const response = await request({ extra: index });
    assert.equal(response.status, 400);
  }
  assert.equal((await request(validBody(`after400_${Date.now()}`))).status, 429);

  resetClientAdminRateLimit();
  const suffix = `conflict_${Date.now()}`;
  const first = await request(validBody(`${suffix}_seed`));
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  const duplicate = {
    ...validBody(`${suffix}_other`),
    username: firstBody.usuario.username,
  };
  for (let index = 0; index < 4; index += 1) {
    assert.equal((await request(duplicate)).status, 409);
  }
  assert.equal((await request(validBody(`${suffix}_blocked`))).status, 429);
});

test('el limitador del alta no afecta otras rutas del panel', async () => {
  resetClientAdminRateLimit();
  const suffix = `other_route_${Date.now()}`;
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await request(validBody(`${suffix}_${index}`))).status, 201);
  }
  const response = await fetch(`${baseUrl}/api/plataforma/resumen`, {
    headers: { Authorization: platformToken },
  });
  assert.equal(response.status, 200);
});

test('el reset del limiter permite comenzar un nuevo período entre tests', async () => {
  resetClientAdminRateLimit();
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await request(validBody(`before_reset_${Date.now()}_${index}`))).status, 201);
  }
  assert.equal((await request(validBody(`blocked_${Date.now()}`))).status, 429);

  resetClientAdminRateLimit();
  assert.equal((await request(validBody(`after_reset_${Date.now()}`))).status, 201);
});

test('la fábrica permite inyectar máximo y ventana para tests', async () => {
  const limiter = createClientAdminLimiter({ max: 1, windowMs: 60_000 });
  assert.equal(typeof limiter, 'function');
});
