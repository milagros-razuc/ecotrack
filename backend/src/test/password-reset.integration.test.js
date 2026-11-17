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
