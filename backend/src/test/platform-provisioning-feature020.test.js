const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createProvisionLimiter } = require('../routes/plataforma');
const { withTemporaryMigrationDatabase } = require('./platform-panel.test-support');

function request(server, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request({
      port,
      method,
      path,
      headers,
    }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

function extractFunctionBlock(source, functionName) {
  const signatureStart = source.indexOf(`function ${functionName}(`);
  assert.ok(signatureStart >= 0, `no se encontró la función ${functionName}`);
  const bodyStart = source.indexOf('{', signatureStart);
  assert.ok(bodyStart >= 0, `no se encontró el cuerpo de ${functionName}`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(signatureStart, index + 1);
    }
  }
  assert.fail(`no se cerró la función ${functionName}`);
}

function stripJavaScriptComments(source) {
  let result = '';
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') {
        lineComment = false;
        result += character;
      }
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    result += character;
    if (character === "'" || character === '"' || character === '`') quote = character;
  }
  return result;
}

async function withRealDatabase(callback) {
  return withTemporaryMigrationDatabase(async ({ database, connectionString, runMigrations }) => {
    await runMigrations();
    const databaseUrl = new URL(connectionString);
    process.env.DB_HOST = databaseUrl.hostname;
    process.env.DB_PORT = databaseUrl.port;
    process.env.DB_USER = decodeURIComponent(databaseUrl.username);
    process.env.DB_PASS = decodeURIComponent(databaseUrl.password);
    process.env.DB_NAME = database;

    for (const modulePath of [
      '../config/db',
      '../config/migrate',
      '../services/auditoria.service',
      '../services/dispositivos.service',
      '../services/enrolamiento.service',
      '../services/plataforma.service',
    ]) {
      delete require.cache[require.resolve(modulePath)];
    }

    const realPool = require('../config/db');
    await require('../config/migrate')();
    try {
      return await callback({ database, pool: realPool });
    } finally {
      await realPool.end();
    }
  });
}

async function seedPlatformActor(pool, suffix = Date.now()) {
  const { rows: clients } = await pool.query(
    'INSERT INTO clientes (nombre, es_plataforma) VALUES ($1, true) RETURNING id',
    [`feature020_platform_${suffix}`],
  );
  const { rows: users } = await pool.query(
    `INSERT INTO usuarios
       (username, password_hash, nombre, rol, cliente_id, token_version)
     VALUES ($1, $2, $3, 'platform_admin', $4, 1)
     RETURNING id, username, cliente_id`,
    [`feature020_user_${suffix}`, 'fixture-password-hash', 'Feature 020', clients[0].id],
  );
  return { clientId: clients[0].id, user: users[0] };
}

async function countProvisioningRows(pool) {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM dispositivos) AS dispositivos,
      (SELECT COUNT(*)::int FROM dispositivos_fabrica) AS dispositivos_fabrica,
      (SELECT COUNT(*)::int FROM auditoria) AS auditoria
  `);
  return rows[0];
}

test('F020 atomicidad real: un fallo en el tercero de cinco deja los conteos intactos', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  await withRealDatabase(async ({ pool }) => {
    const actor = await seedPlatformActor(pool, `atomic_${Date.now()}`);
    await pool.query(`
      CREATE OR REPLACE FUNCTION feature020_fail_third_device()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE inserted_count integer;
      BEGIN
        SELECT COUNT(*) INTO inserted_count FROM dispositivos
          WHERE codigo LIKE 'ET-%';
        IF inserted_count >= 2 THEN
          RAISE EXCEPTION 'feature020 simulated third device failure';
        END IF;
        RETURN NEW;
      END $$;
    `);
    await pool.query(`
      CREATE TRIGGER feature020_fail_third_device_trigger
      BEFORE INSERT ON dispositivos
      FOR EACH ROW EXECUTE FUNCTION feature020_fail_third_device()
    `);
    const before = await countProvisioningRows(pool);
    const { fabricarDispositivos } = require('../services/plataforma.service');
    await assert.rejects(
      fabricarDispositivos({
        motivo: 'lote de atomicidad real',
        cantidad: 5,
        usuario: { sub: actor.user.id, username: actor.user.username, clienteId: actor.clientId },
      }),
      /No se pudieron fabricar los dispositivos/,
    );
    assert.deepEqual(await countProvisioningRows(pool), before);
  });
});

test('F020 fail-closed real: un fallo de auditoría deja los conteos intactos', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  await withRealDatabase(async ({ pool }) => {
    const actor = await seedPlatformActor(pool, `audit_${Date.now()}`);
    await pool.query(`
      CREATE OR REPLACE FUNCTION feature020_fail_audit()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.accion = 'fabricar_dispositivos' THEN
          RAISE EXCEPTION 'feature020 simulated audit failure';
        END IF;
        RETURN NEW;
      END $$;
    `);
    await pool.query(`
      CREATE TRIGGER feature020_fail_audit_trigger
      BEFORE INSERT ON auditoria
      FOR EACH ROW EXECUTE FUNCTION feature020_fail_audit()
    `);
    const before = await countProvisioningRows(pool);
    const { fabricarDispositivos } = require('../services/plataforma.service');
    await assert.rejects(
      fabricarDispositivos({
        motivo: 'auditoría fail closed real',
        cantidad: 1,
        usuario: { sub: actor.user.id, username: actor.user.username, clienteId: actor.clientId },
      }),
      /No se pudieron fabricar los dispositivos/,
    );
    assert.deepEqual(await countProvisioningRows(pool), before);
  });
});

test('F020 rate limit: el contador de provisionamiento es propio y por usuario', async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.usuario = { sub: req.headers['x-user'] };
    next();
  });
  app.get('/', createProvisionLimiter({ max: 1, windowMs: 60_000 }), (_req, res) => res.sendStatus(200));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  try {
    assert.equal(await request(server, { headers: { 'x-user': 'user-a' } }), 200);
    assert.equal(await request(server, { headers: { 'x-user': 'user-a' } }), 429);
    assert.equal(await request(server, { headers: { 'x-user': 'user-b' } }), 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('F020 rate limit usa el tope real y configuración independiente', async () => {
  const { rateLimits } = require('../config/platformPanelConfig');
  assert.equal(rateLimits.provision.max, 5);
  assert.equal(rateLimits.provision.windowMs, 15 * 60 * 1000);
  assert.notEqual(rateLimits.provision.max, rateLimits.read.max);
  assert.notEqual(rateLimits.provision.max, rateLimits.reset.max);

  const app = express();
  app.use((req, _res, next) => {
    req.usuario = { sub: 'fixed-platform-user' };
    next();
  });
  app.get('/', createProvisionLimiter(), (_req, res) => res.sendStatus(200));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  try {
    for (let requestNumber = 0; requestNumber < rateLimits.provision.max; requestNumber += 1) {
      assert.equal(await request(server), 200, `pedido ${requestNumber + 1}`);
    }
    assert.equal(await request(server), 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('F020 router montado a mano: 401/403/400', async () => {
  const requirePlatformAdmin = require('../middleware/platformAdmin');
  const router = require('../routes/plataforma');
  const app = express();
  app.use(express.json());
  app.use('/', (req, _res, next) => {
    const user = req.headers['x-user'];
    if (user === 'platform') req.usuario = { sub: '1' , username: 'platform', clienteId: 1, rol: 'platform_admin' };
    if (user === 'admin') req.usuario = { rol: 'admin' };
    if (user === 'operario1') req.usuario = { rol: 'comun' };
    next();
  }, requirePlatformAdmin, router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  try {
    assert.equal(await request(server), 401);
    for (const role of ['admin', 'operario1']) {
      assert.equal(await request(server, { method: 'POST', path: '/dispositivos', headers: { 'x-user': role, 'content-type': 'application/json' }, body: { motivo: 'válido', cliente_id: 1 } }), 403);
    }
    assert.equal(await request(server, { method: 'POST', path: '/dispositivos', headers: { 'x-user': 'platform', 'content-type': 'application/json' }, body: { motivo: 'válido', cliente_id: 1 } }), 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('F020 extremo a extremo: el lote se reclama y se enrola con dynamicSecurity simulado', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  await withRealDatabase(async ({ pool }) => {
    const actor = await seedPlatformActor(pool, `e2e_${Date.now()}`);
    const { rows: clients } = await pool.query(
      'INSERT INTO clientes (nombre, es_plataforma) VALUES ($1, false) RETURNING id',
      [`feature020_operational_${Date.now()}`],
    );
    const { fabricarDispositivos } = require('../services/plataforma.service');
    const { reclamar } = require('../services/dispositivos.service');
    const { createEnrollmentService } = require('../services/enrolamiento.service');

    const [item] = await fabricarDispositivos({
      motivo: 'flujo e2e',
      cantidad: 1,
      usuario: { sub: actor.user.id, username: actor.user.username, clienteId: actor.clientId },
    });
    const csvRows = item.nvs_csv.trim().split(/\r?\n/);
    const deviceSecret = csvRows.find((row) => row.startsWith('deviceSecret,')).split(',')[3];

    const claimed = await reclamar({
      codigo: item.codigo,
      nombre: 'E2E',
      ubicacion: 'Laboratorio',
      token: item.token_reclamo,
      clienteId: clients[0].id,
    });
    assert.equal(claimed.ok, true);

    const dynamicCalls = [];
    const enrollment = createEnrollmentService({
      pool,
      dynamicSecurity: {
        async provisionDevice(identity) {
          dynamicCalls.push({ action: 'provision', ...identity });
          return { username: identity.deviceId, password: identity.password };
        },
      },
      randomBytes: () => Buffer.from('fixed-e2e-password'),
    });
    const enrolled = await enrollment.enrolar({
      deviceId: item.codigo,
      deviceSecret,
    });

    assert.equal(enrolled.device_id, item.codigo);
    assert.equal(dynamicCalls.length, 1);
    const { rows } = await pool.query(
      `SELECT d.cliente_id, d.reclamado_en, f.enrolled_at
       FROM dispositivos d
       JOIN dispositivos_fabrica f ON f.device_id = d.codigo
       WHERE d.codigo = $1`,
      [item.codigo],
    );
    assert.equal(rows[0].cliente_id, clients[0].id);
    assert.ok(rows[0].reclamado_en);
    assert.ok(rows[0].enrolled_at);
  });
});

test('F020 frontend: el modal asigna valores con textContent y limpia secretos al cerrar', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../../frontend/plataforma.html'), 'utf8');
  const closeBlock = stripJavaScriptComments(extractFunctionBlock(source, 'cerrarProvision'));
  const modalBlock = stripJavaScriptComments([
    'cerrarProvision',
    'descargarNvs',
    'renderProvisionResults',
    'fabricarDispositivos',
  ].map((functionName) => extractFunctionBlock(source, functionName)).join('\n'));
  assert.match(modalBlock, /URL\.createObjectURL\(/);
  assert.match(modalBlock, /URL\.revokeObjectURL\(url\)/);
  assert.match(modalBlock, /code\.textContent\s*=\s*item\.codigo/);
  assert.match(modalBlock, /token\.textContent\s*=\s*`Token de reclamo: \$\{item\.token_reclamo\}`/);
  assert.doesNotMatch(modalBlock, /\.innerHTML\s*=/);
  assert.match(modalBlock, /provisionItems\s*=\s*null/);
  assert.match(modalBlock, /provisionResults\.replaceChildren\(\)/);
  assert.match(modalBlock, /provisionError\.textContent\s*=\s*''/);
  assert.match(modalBlock, /provisionForm\.reset\(\)/);
  assert.match(closeBlock, /provisionResults\.replaceChildren\(\)/);
  assert.match(closeBlock, /provisionItems\s*=\s*null/);
});

test('F020 auditoría real de fabricación no contiene secretos ni hashes', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  await withRealDatabase(async ({ pool }) => {
    const actor = await seedPlatformActor(pool, `audit_safe_${Date.now()}`);
    const motivo = 'auditoría real sin secretos';
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
    };
    const logs = [];
    for (const method of ['log', 'error', 'warn']) {
      console[method] = (...args) => logs.push(args.map(String).join(' '));
    }

    try {
      const { fabricarDispositivos } = require('../services/plataforma.service');
      const items = await fabricarDispositivos({
        motivo,
        cantidad: 2,
        usuario: { sub: actor.user.id, username: actor.user.username, clienteId: actor.clientId },
      });
      const codes = items.map((item) => item.codigo);
      const tokens = items.map((item) => item.token_reclamo);
      const secrets = items.map((item) => item.nvs_csv
        .split(/\r?\n/)
        .find((row) => row.startsWith('deviceSecret,'))
        .split(',')[3]);
      const { hashFactorySecret } = require('../services/enrolamiento.service');
      const hashes = secrets.map((secret) => hashFactorySecret(secret));
      const { rows } = await pool.query(
        `SELECT detalle
         FROM auditoria
         WHERE usuario_id = $1 AND accion = 'fabricar_dispositivos'
         ORDER BY id DESC
         LIMIT 1`,
        [actor.user.id],
      );
      assert.equal(rows.length, 1);
      const auditText = rows[0].detalle;
      const logText = logs.join('\n');
      assert.ok(auditText.includes(motivo), 'la auditoría debe contener el motivo');
      assert.ok(auditText.includes('"cantidad":2'), 'la auditoría debe contener la cantidad');
      for (const code of codes) {
        assert.ok(auditText.includes(code), `la auditoría debe contener el código ${code}`);
      }
      for (const value of [...tokens, ...secrets, ...hashes]) {
        assert.ok(!auditText.includes(value), `la auditoría no debe contener ${value}`);
        assert.ok(!logText.includes(value), `los logs no deben contener ${value}`);
      }
      assert.ok(!/[0-9a-f]{64}/i.test(auditText), 'la auditoría no debe contener hashes SHA-256');
      assert.ok(!/[0-9a-f]{64}/i.test(logText), 'los logs no deben contener hashes SHA-256');
    } finally {
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
    }
  });
});
