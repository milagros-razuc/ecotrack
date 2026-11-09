const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
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
        ...(requestBody ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(requestBody) } : {}),
        ...headers,
      },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        body: responseBody ? JSON.parse(responseBody) : null,
      }));
    });
    req.on('error', reject);
    req.end(requestBody);
  });
}

test('Feature 021 HTTP real permite me y change-password pero bloquea rutas operativas', async () => {
  await withTemporaryMigrationDatabase(async ({ connectionString }) => {
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
    let port;
    try {
      await pool.query(fs.readFileSync(
        path.resolve(__dirname, '../../migrations/020_client_admin.sql'),
        'utf8',
      ));
      const password = 'Temporal-Password-123';
      const { rows } = await pool.query(
        `INSERT INTO usuarios
          (username, password_hash, nombre, rol, cliente_id, must_change_password)
         VALUES ('http-pending-021', $1, 'HTTP Pending', 'admin', 1, true)
         RETURNING id`,
        [await bcrypt.hash(password, 10)],
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
          JWT_SECRET: 'http-test-secret',
          NODE_ENV: 'test',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      port = await new Promise((resolve, reject) => {
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
        appProcess.once('exit', (code) => {
          reject(new Error(`HTTP test app exited with code ${code}`));
        });
      });

      const login = await request(port, {
        method: 'POST',
        path: '/api/auth/login',
        body: { username: 'http-pending-021', password },
      });
      assert.equal(login.statusCode, 200);
      const token = login.body.token;
      const authorization = { Authorization: token };

      const me = await request(port, {
        method: 'GET',
        path: '/api/auth/me',
        headers: authorization,
      });
      assert.equal(me.statusCode, 200);
      assert.equal(me.body.must_change_password, true);

      const operational = await request(port, {
        method: 'GET',
        path: '/api/dispositivos',
        headers: authorization,
      });
      assert.equal(operational.statusCode, 403);
      assert.equal(operational.body.code, 'PASSWORD_CHANGE_REQUIRED');

      const changed = await request(port, {
        method: 'POST',
        path: '/api/auth/change-password',
        headers: authorization,
        body: { passwordActual: password, passwordNueva: 'Nueva-Segura-456' },
      });
      assert.equal(changed.statusCode, 200);
      assert.equal(changed.body.ok, true);
      assert.equal(typeof changed.body.token, 'string');

      const oldTokenResponse = await request(port, {
        method: 'GET',
        path: '/api/dispositivos',
        headers: authorization,
      });
      assert.equal(oldTokenResponse.statusCode, 401);
      assert.equal(oldTokenResponse.body.code, 'SESSION_INVALIDATED');

      const newTokenResponse = await request(port, {
        method: 'GET',
        path: '/api/dispositivos',
        headers: { Authorization: changed.body.token },
      });
      assert.equal(newTokenResponse.statusCode, 200);
      assert.notEqual(newTokenResponse.body.code, 'PASSWORD_CHANGE_REQUIRED');

      const temporaryPasswordLogin = await request(port, {
        method: 'POST',
        path: '/api/auth/login',
        body: { username: 'http-pending-021', password },
      });
      assert.equal(temporaryPasswordLogin.statusCode, 401);
    } finally {
      if (appProcess) {
        appProcess.kill();
        await new Promise((resolve) => appProcess.once('exit', resolve));
      }
      await pool.end();
    }
  });
});
