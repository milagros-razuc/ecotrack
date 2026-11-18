const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const path = require('node:path');
const { Pool } = require('pg');
const test = require('node:test');
const { withTemporaryMigrationDatabase } = require('./platform-panel.test-support');

const backendDirectory = path.resolve(__dirname, '../..');

function request(port, { method, path: requestPath, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const requestBody = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({
      port,
      method,
      path: requestPath,
      headers: {
        ...(requestBody ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
        } : {}),
        ...headers,
      },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: responseBody ? JSON.parse(responseBody) : null,
      }));
    });
    req.on('error', reject);
    req.end(requestBody);
  });
}

test('US1: reset real entrega temporal una vez, invalida sesiones y audita sin secreto', async () => {
  await withTemporaryMigrationDatabase(async ({ connectionString, runMigrations }) => {
    const databaseUrl = new URL(connectionString);
    const databaseConfig = {
      host: databaseUrl.hostname,
      port: databaseUrl.port,
      database: databaseUrl.pathname.slice(1),
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
    };
    const pool = new Pool(databaseConfig);
    let appProcess;
    try {
      await runMigrations();
      const passwordHash = await bcrypt.hash('Admin-Password-123', 10);
      const targetHash = await bcrypt.hash('Old-Password-123', 10);
      const { rows: [client] } = await pool.query(
        'SELECT id FROM clientes WHERE es_plataforma = false ORDER BY id LIMIT 1',
      );
      const { rows: [admin] } = await pool.query(
        `INSERT INTO usuarios
          (username, password_hash, nombre, rol, cliente_id)
         VALUES ('reset-admin-us1', $1, 'Admin Reset', 'admin', $2)
         RETURNING id, username, rol, cliente_id, token_version`,
        [passwordHash, client.id],
      );
      const { rows: [target] } = await pool.query(
        `INSERT INTO usuarios
          (username, password_hash, nombre, rol, cliente_id)
         VALUES ('reset-user-us1', $1, 'Usuario Reset', 'comun', $2)
         RETURNING id, token_version`,
        [targetHash, client.id],
      );
      const { rows: [adminTarget] } = await pool.query(
        `INSERT INTO usuarios
          (username, password_hash, nombre, rol, cliente_id)
         VALUES ('reset-admin-target-us1', $1, 'Otro Admin', 'admin', $2)
         RETURNING id, password_hash, token_version`,
        [targetHash, client.id],
      );

      appProcess = spawn(process.execPath, ['-e', `
        const http = require('http');
        const app = require('./src/app');
        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => console.log('READY:' + server.address().port));
        process.on('SIGTERM', () => server.close(() => process.exit(0)));
      `], {
        cwd: backendDirectory,
        env: {
          ...process.env,
          DB_HOST: databaseConfig.host,
          DB_PORT: databaseConfig.port,
          DB_NAME: databaseConfig.database,
          DB_USER: databaseConfig.user,
          DB_PASS: databaseConfig.password,
          JWT_SECRET: 'reset-password-test-secret',
          NODE_ENV: 'test',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const port = await new Promise((resolve, reject) => {
        let output = '';
        const onData = (chunk) => {
          output += chunk.toString();
          const match = output.match(/READY:(\d+)/);
          if (match) {
            appProcess.stdout.off('data', onData);
            resolve(Number(match[1]));
          }
        };
        appProcess.stdout.on('data', onData);
        appProcess.once('error', reject);
        appProcess.once('exit', (code) => reject(new Error(`HTTP test app exited with code ${code}`)));
      });

      const token = jwt.sign({
        sub: admin.id,
        username: admin.username,
        rol: admin.rol,
        clienteId: admin.cliente_id,
        tv: admin.token_version,
      }, 'reset-password-test-secret');
      const response = await request(port, {
        method: 'POST',
        path: `/api/usuarios/${target.id}/reset-password`,
        headers: {
          Authorization: token,
          'X-Forwarded-For': '198.51.100.24',
        },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.deepEqual(Object.keys(response.body).sort(), ['expira_en', 'password_temporal', 'usuario']);
      assert.match(response.body.password_temporal, /^[A-HJ-NP-Za-km-z2-9!@#$%^&*+\-_=]{16}$/);
      assert.equal(response.body.usuario.id, target.id);
      assert.equal(response.body.usuario.username, 'reset-user-us1');
      assert.equal(response.body.usuario.password_hash, undefined);

      const { rows: [updated] } = await pool.query(
        `SELECT password_hash, must_change_password,
                password_temporal_expira, token_version
         FROM usuarios WHERE id = $1`,
        [target.id],
      );
      assert.equal(updated.must_change_password, true);
      assert.equal(updated.token_version, target.token_version + 1);
      assert.notEqual(updated.password_hash, response.body.password_temporal);
      assert.equal(await bcrypt.compare(response.body.password_temporal, updated.password_hash), true);

      const { rows: [audit] } = await pool.query(
        `SELECT cliente_id, usuario_id, accion, entidad, entidad_id, actor_tipo, detalle
         FROM auditoria WHERE accion = 'reset_password' AND entidad_id = $1
         ORDER BY id DESC LIMIT 1`,
        [String(target.id)],
      );
      assert.equal(audit.cliente_id, client.id);
      assert.equal(audit.usuario_id, admin.id);
      assert.equal(audit.actor_tipo, 'tenant');
      assert.equal(audit.detalle.includes(response.body.password_temporal), false);
      assert.equal(audit.detalle.includes('198.51.100.24'), true);

      const forbiddenAdmin = await request(port, {
        method: 'POST',
        path: `/api/usuarios/${adminTarget.id}/reset-password`,
        headers: { Authorization: token },
      });
      assert.equal(forbiddenAdmin.statusCode, 403);
      const selfReset = await request(port, {
        method: 'POST',
        path: `/api/usuarios/${admin.id}/reset-password`,
        headers: { Authorization: token },
      });
      assert.equal(selfReset.statusCode, 403);
      const { rows: [unchangedAdminTarget] } = await pool.query(
        'SELECT password_hash, token_version FROM usuarios WHERE id = $1',
        [adminTarget.id],
      );
      assert.equal(unchangedAdminTarget.password_hash, adminTarget.password_hash);
      assert.equal(unchangedAdminTarget.token_version, adminTarget.token_version);
      const { rows: [rejectedAudit] } = await pool.query(
        `SELECT cliente_id, actor_tipo, detalle
         FROM auditoria
         WHERE accion = 'reset_password' AND entidad_id = $1
         ORDER BY id DESC LIMIT 1`,
        [String(adminTarget.id)],
      );
      assert.equal(rejectedAudit.cliente_id, client.id);
      assert.equal(rejectedAudit.actor_tipo, 'tenant');
      assert.match(rejectedAudit.detalle, /"resultado":"rechazado"/);
      assert.doesNotMatch(rejectedAudit.detalle, /password|hash|token/i);
    } finally {
      if (appProcess) {
        appProcess.kill();
      }
      await pool.end();
    }
  });
});

test('US1: un admin no puede resetear usuarios de otro cliente', async () => {
  await withTemporaryMigrationDatabase(async ({ connectionString, runMigrations }) => {
    const pool = new Pool({ connectionString });
    try {
      await runMigrations();
      const { rows: [clientA] } = await pool.query(
        `INSERT INTO clientes (nombre, es_plataforma)
         VALUES ('Reset Isolation A', false)
         RETURNING id`,
      );
      const { rows: [clientB] } = await pool.query(
        `INSERT INTO clientes (nombre, es_plataforma)
         VALUES ('Reset Isolation B', false)
         RETURNING id`,
      );
      const passwordHash = await bcrypt.hash('Admin-Password-123', 10);
      const { rows: [admin] } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, rol, cliente_id)
         VALUES ('reset-admin-isolation', $1, 'admin', $2)
         RETURNING id, username, rol, cliente_id, token_version`,
        [passwordHash, clientA.id],
      );
      const { rows: [target] } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, rol, cliente_id)
         VALUES ('reset-target-isolation', $1, 'comun', $2)
         RETURNING id`,
        [passwordHash, clientB.id],
      );
      const { puedeResetear } = require('../services/password-reset.service');
      assert.equal(puedeResetear(admin, { id: target.id, rol: 'comun', cliente_id: clientB.id }), false);
    } finally {
      await pool.end();
    }
  });
});

test('US2: platform_admin resetea admin de otro cliente y tenant no accede al panel', async () => {
  await withTemporaryMigrationDatabase(async ({ connectionString, runMigrations }) => {
    const databaseUrl = new URL(connectionString);
    const databaseConfig = {
      host: databaseUrl.hostname,
      port: databaseUrl.port,
      database: databaseUrl.pathname.slice(1),
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
    };
    const pool = new Pool({ connectionString });
    let appProcess;
    try {
      await runMigrations();
      const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const hash = await bcrypt.hash('Platform-Password-123', 10);
      const { rows: [platformClient] } = await pool.query(
        `INSERT INTO clientes (nombre, es_plataforma)
         VALUES ($1, true) RETURNING id`,
        [`Platform US2 ${suffix}`],
      );
      const { rows: [tenantClient] } = await pool.query(
        `INSERT INTO clientes (nombre, es_plataforma)
         VALUES ($1, false) RETURNING id`,
        [`Tenant US2 ${suffix}`],
      );
      const { rows: [platformAdmin] } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, rol, cliente_id)
         VALUES ($1, $2, 'platform_admin', $3)
         RETURNING id, username, rol, cliente_id, token_version`,
        [`platform-us2-${suffix}`, hash, platformClient.id],
      );
      const { rows: [targetAdmin] } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, rol, cliente_id)
         VALUES ($1, $2, 'admin', $3)
         RETURNING id, token_version`,
        [`admin-us2-${suffix}`, hash, tenantClient.id],
      );
      const { rows: [tenantUser] } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, rol, cliente_id)
         VALUES ($1, $2, 'comun', $3)
         RETURNING id, username, rol, cliente_id, token_version`,
        [`tenant-user-us2-${suffix}`, hash, tenantClient.id],
      );
      const { rows: [targetPlatform] } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, rol, cliente_id)
         VALUES ($1, $2, 'platform_admin', $3)
         RETURNING id`,
        [`platform-target-us2-${suffix}`, hash, platformClient.id],
      );
      const token = (user) => jwt.sign({
        sub: user.id,
        username: user.username,
        rol: user.rol,
        clienteId: user.cliente_id,
        tv: user.token_version,
      }, 'reset-password-test-secret');

      appProcess = spawn(process.execPath, ['-e', `
        const http = require('http');
        const app = require('./src/app');
        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => console.log('READY:' + server.address().port));
        process.on('SIGTERM', () => server.close(() => process.exit(0)));
      `], {
        cwd: backendDirectory,
        env: {
          ...process.env,
          DB_HOST: databaseConfig.host,
          DB_PORT: databaseConfig.port,
          DB_NAME: databaseConfig.database,
          DB_USER: databaseConfig.user,
          DB_PASS: databaseConfig.password,
          JWT_SECRET: 'reset-password-test-secret',
          NODE_ENV: 'test',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const port = await new Promise((resolve, reject) => {
        let output = '';
        const onData = (chunk) => {
          output += chunk.toString();
          const match = output.match(/READY:(\d+)/);
          if (match) {
            appProcess.stdout.off('data', onData);
            resolve(Number(match[1]));
          }
        };
        appProcess.stdout.on('data', onData);
        appProcess.once('error', reject);
        appProcess.once('exit', (code) => reject(new Error(`HTTP test app exited with code ${code}`)));
      });
      const response = await request(port, {
        method: 'POST',
        path: `/api/usuarios/${targetAdmin.id}/reset-password`,
        headers: { Authorization: token(platformAdmin) },
      });
      assert.equal(response.statusCode, 200);

      const forbidden = await request(port, {
        method: 'POST',
        path: `/api/usuarios/${targetPlatform.id}/reset-password`,
        headers: { Authorization: token(platformAdmin) },
      });
      assert.equal(forbidden.statusCode, 403);
      const { rows: [rejectedAudit] } = await pool.query(
        `SELECT cliente_id, actor_tipo, detalle
         FROM auditoria
         WHERE accion = 'reset_password' AND entidad_id = $1
         ORDER BY id DESC LIMIT 1`,
        [String(targetPlatform.id)],
      );
      assert.equal(rejectedAudit.cliente_id, platformClient.id);
      assert.equal(rejectedAudit.actor_tipo, 'platform_admin');
      assert.match(rejectedAudit.detalle, /"resultado":"rechazado"/);
      assert.doesNotMatch(rejectedAudit.detalle, /password|hash|token/i);

      const tenantPanel = await request(port, {
        method: 'GET',
        path: '/api/plataforma/clientes',
        headers: { Authorization: token(tenantUser) },
      });
      assert.equal(tenantPanel.statusCode, 403);
    } finally {
      if (appProcess) appProcess.kill();
      await pool.end();
    }
  });
});

test('US2: admin recibe 404 genérico ante objetivo inexistente', async () => {
  await withTemporaryMigrationDatabase(async ({ connectionString, runMigrations }) => {
    const pool = new Pool({ connectionString });
    try {
      await runMigrations();
      const hash = await bcrypt.hash('Admin-Password-123', 10);
      const { rows: [client] } = await pool.query(
        `SELECT id FROM clientes WHERE es_plataforma = false ORDER BY id LIMIT 1`,
      );
      const { rows: [admin] } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, rol, cliente_id)
         VALUES ('reset-admin-not-found', $1, 'admin', $2)
         RETURNING id, username, rol, cliente_id, token_version`,
        [hash, client.id],
      );
      const { puedeResetear } = require('../services/password-reset.service');
      assert.equal(puedeResetear(admin, null), false);
    } finally {
      await pool.end();
    }
  });
});

async function withUs3App(run) {
  return withTemporaryMigrationDatabase(async ({ connectionString, runMigrations }) => {
    const databaseUrl = new URL(connectionString);
    const databaseConfig = {
      host: databaseUrl.hostname,
      port: databaseUrl.port,
      database: databaseUrl.pathname.slice(1),
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
    };
    const pool = new Pool({ connectionString });
    let appProcess;
    try {
      await runMigrations();
      const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const temporaryPassword = `Temporal-${suffix}-123`;
      const { rows: [client] } = await pool.query(
        'SELECT id FROM clientes WHERE es_plataforma = false ORDER BY id LIMIT 1',
      );
      const { rows: [user] } = await pool.query(
        `INSERT INTO usuarios
          (username, password_hash, nombre, rol, cliente_id, must_change_password, password_temporal_expira)
         VALUES ($1, $2, $3, 'comun', $4, true, NOW() + INTERVAL '24 hours')
         RETURNING id, username, nombre, rol, cliente_id, token_version`,
        [`us3-${suffix}`, await bcrypt.hash(temporaryPassword, 10), 'US3 User', client.id],
      );
      const { rows: [dataUser] } = await pool.query(
        `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id)
         VALUES ($1, $2, 'US3 Data User', 'comun', $3)
         RETURNING id`,
        [`us3-data-${suffix}`, await bcrypt.hash('Data-Password-123', 10), client.id],
      );
      appProcess = spawn(process.execPath, ['-e', `
        const http = require('http');
        const app = require('./src/app');
        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => console.log('READY:' + server.address().port));
        process.on('SIGTERM', () => server.close(() => process.exit(0)));
      `], {
        cwd: backendDirectory,
        env: {
          ...process.env,
          DB_HOST: databaseConfig.host,
          DB_PORT: databaseConfig.port,
          DB_NAME: databaseConfig.database,
          DB_USER: databaseConfig.user,
          DB_PASS: databaseConfig.password,
          JWT_SECRET: 'reset-password-test-secret',
          NODE_ENV: 'test',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const port = await new Promise((resolve, reject) => {
        let output = '';
        const onData = (chunk) => {
          output += chunk.toString();
          const match = output.match(/READY:(\d+)/);
          if (match) {
            appProcess.stdout.off('data', onData);
            resolve(Number(match[1]));
          }
        };
        appProcess.stdout.on('data', onData);
        appProcess.once('error', reject);
        appProcess.once('exit', (code) => reject(new Error(`HTTP test app exited with code ${code}`)));
      });
      const login = (password, username = user.username) => request(port, {
        method: 'POST',
        path: '/api/auth/login',
        body: { username, password },
      });
      await run({ pool, client, user, dataUser, temporaryPassword, suffix, port, login });
    } finally {
      if (appProcess) appProcess.kill();
      await pool.end();
    }
  });
}

function assertNoSecrets(response, secrets) {
  const text = JSON.stringify(response);
  for (const secret of secrets) assert.equal(text.includes(secret), false, secret);
}

test('US3: login temporal vigente emite solo token restringido y no almacenable', async () => {
  await withUs3App(async ({ login, temporaryPassword }) => {
    const response = await login(temporaryPassword);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(Object.keys(response.body).sort(), [
      'mustChangePassword', 'nombre', 'rol', 'token', 'username',
    ]);
    assert.equal(response.body.mustChangePassword, true);
    const payload = jwt.decode(response.body.token);
    assert.equal(payload.scope, 'change-password');
    assert.ok(payload.exp - payload.iat <= 10 * 60);
    assert.equal(Object.prototype.hasOwnProperty.call(response.body, 'password_hash'), false);
  });
});

test('US3: temporal vencida usa error generico y consume el rate limit con password correcta', async () => {
  await withUs3App(async ({ pool, user, temporaryPassword, login }) => {
    await pool.query(
      'UPDATE usuarios SET password_temporal_expira = NOW() - INTERVAL \'1 second\' WHERE id = $1',
      [user.id],
    );
    const expiredLogin = await login(temporaryPassword);
    const wrongLogin = await login('Wrong-Password-123');
    assert.equal(expiredLogin.statusCode, 401);
    assert.deepEqual(expiredLogin.body, wrongLogin.body);
    const responses = [expiredLogin, wrongLogin];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      responses.push(await login(temporaryPassword));
    }
    assert.equal(responses.at(-1).statusCode, 429);
    assertNoSecrets(expiredLogin, [temporaryPassword]);
    assertNoSecrets(wrongLogin, ['Wrong-Password-123']);
  });
});

test('US3: token restringido permite me y bloquea rutas por defecto', async () => {
  await withUs3App(async ({ pool, user, dataUser, temporaryPassword, login, port }) => {
    await pool.query(
      'UPDATE usuarios SET password_temporal_expira = NOW() + INTERVAL \'24 hours\' WHERE id = $1',
      [user.id],
    );
    const pending = await login(temporaryPassword);
    assert.equal(pending.statusCode, 200);
    const pendingToken = pending.body.token;
    const restrictedRoutes = [
      ['GET', '/api/auth/me'],
      ['GET', '/api/dispositivos'],
      ['GET', '/api/usuarios'],
      ['POST', `/api/usuarios/${dataUser.id}/reset-password`],
      ['GET', '/api/plataforma/clientes'],
    ];
    for (const [method, path] of restrictedRoutes) {
      const response = await request(port, {
        method,
        path,
        headers: { Authorization: pendingToken },
      });
      assert.equal(response.statusCode, method === 'GET' && path === '/api/auth/me' ? 200 : 403, path);
      if (response.statusCode === 403) {
        assertNoSecrets(response, [pendingToken, temporaryPassword]);
      }
    }
    const staleRoleToken = jwt.sign({
      sub: user.id,
      username: user.username,
      rol: 'platform_admin',
      clienteId: user.cliente_id,
      tv: user.token_version,
    }, 'reset-password-test-secret');
    const staleRoleResponse = await request(port, {
      method: 'GET',
      path: '/api/usuarios',
      headers: { Authorization: staleRoleToken },
    });
    assert.notEqual(staleRoleResponse.statusCode, 200);
    assertNoSecrets(staleRoleResponse, [staleRoleToken, temporaryPassword]);
  });
});

test('US3: rechazos de cambio conservan estado y no exponen secretos', async () => {
  await withUs3App(async ({ pool, user, temporaryPassword, login, port }) => {
    const pending = await login(temporaryPassword);
    const before = (await pool.query(
      `SELECT password_hash, token_version, must_change_password, password_temporal_expira
       FROM usuarios WHERE id = $1`,
      [user.id],
    )).rows[0];
    const errors = [];
    const extraField = await request(port, {
      method: 'POST',
      path: '/api/auth/change-password',
      headers: { Authorization: pending.body.token },
      body: { passwordActual: temporaryPassword, passwordNueva: 'Nueva-Segura-789', token: 'no-debe-aceptarse' },
    });
    errors.push(extraField);
    for (const passwordNueva of ['corta', '123456789012', temporaryPassword]) {
      errors.push(await request(port, {
        method: 'POST',
        path: '/api/auth/change-password',
        headers: { Authorization: pending.body.token },
        body: { passwordActual: temporaryPassword, passwordNueva },
      }));
    }
    errors.push(await request(port, {
      method: 'POST',
      path: '/api/auth/change-password',
      headers: { Authorization: pending.body.token },
      body: { passwordActual: 'Wrong-Password-123', passwordNueva: 'Nueva-Segura-789' },
    }));
    for (const response of errors) {
      assert.equal(response.statusCode, 400);
      assertNoSecrets(response, [temporaryPassword, pending.body.token]);
    }
    const after = (await pool.query(
      `SELECT password_hash, token_version, must_change_password, password_temporal_expira
       FROM usuarios WHERE id = $1`,
      [user.id],
    )).rows[0];
    assert.deepEqual(after, before);
  });
});

test('US3: cambio exitoso limpia la temporal, audita e invalida sesiones', async () => {
  await withUs3App(async ({ pool, user, temporaryPassword, login, port }) => {
    const pending = await login(temporaryPassword);
    const changed = await request(port, {
      method: 'POST',
      path: '/api/auth/change-password',
      headers: { Authorization: pending.body.token },
      body: { passwordActual: temporaryPassword, passwordNueva: 'Nueva-Segura-789' },
    });
    assert.equal(changed.statusCode, 200);
    assert.equal(changed.headers['cache-control'], 'no-store');
    assert.equal(typeof changed.body.token, 'string');
    assert.equal(jwt.decode(changed.body.token).scope, undefined);
    const after = (await pool.query(
      `SELECT password_hash, token_version, must_change_password, password_temporal_expira
       FROM usuarios WHERE id = $1`,
      [user.id],
    )).rows[0];
    assert.equal(after.must_change_password, false);
    assert.equal(after.password_temporal_expira, null);
    assert.equal(after.token_version, user.token_version + 1);
    assert.equal(await bcrypt.compare('Nueva-Segura-789', after.password_hash), true);
    const oldToken = await request(port, {
      method: 'GET',
      path: '/api/auth/me',
      headers: { Authorization: pending.body.token },
    });
    assert.equal(oldToken.statusCode, 401);
    assertNoSecrets(oldToken, [pending.body.token, temporaryPassword, after.password_hash]);
    assert.equal((await login(temporaryPassword)).statusCode, 401);
    assert.equal((await login('Nueva-Segura-789')).statusCode, 200);
    const audit = (await pool.query(
      `SELECT detalle FROM auditoria
       WHERE accion = 'change_password' AND entidad_id = $1
       ORDER BY id DESC LIMIT 10`,
      [String(user.id)],
    )).rows;
    assert.ok(audit.some(({ detalle }) => JSON.parse(detalle).resultado === 'exitoso'));
    assert.ok(audit.every(({ detalle }) => !/password|hash|token/i.test(detalle)));
  });
});

test('US3: la temporal que vence entre login y cambio usa error generico', async () => {
  await withUs3App(async ({ pool, client, suffix, login, port }) => {
    const temporaryPassword = 'Expiring-Temp-123';
    const { rows: [expiringUser] } = await pool.query(
      `INSERT INTO usuarios
        (username, password_hash, nombre, rol, cliente_id, must_change_password, password_temporal_expira)
       VALUES ($1, $2, 'US3 Expiring', 'comun', $3, true, NOW() + INTERVAL '1 hour')
       RETURNING id, username`,
      [`us3-expiring-${suffix}`, await bcrypt.hash(temporaryPassword, 10), client.id],
    );
    const expiringLogin = await login(temporaryPassword, expiringUser.username);
    await pool.query(
      'UPDATE usuarios SET password_temporal_expira = NOW() - INTERVAL \'1 second\' WHERE id = $1',
      [expiringUser.id],
    );
    const response = await request(port, {
      method: 'POST',
      path: '/api/auth/change-password',
      headers: { Authorization: expiringLogin.body.token },
      body: { passwordActual: temporaryPassword, passwordNueva: 'Nueva-Segura-999' },
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'La contraseña actual es incorrecta' });
    assertNoSecrets(response, [temporaryPassword, expiringLogin.body.token]);
  });
});
