const assert = require('assert');
const http = require('http');
const express = require('express');
const test = require('node:test');
const { createLoginLimiter } = require('../middleware/rateLimiter');

function createTestServer() {
  const app = express();
  app.use(express.json());
  app.post('/login', createLoginLimiter(), (req, res) => {
    if (req.body.password === 'correcta') {
      return res.json({ ok: true });
    }
    res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  });
  return app.listen(0);
}

function request(server, username, password = 'incorrecta') {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(
      username === undefined ? { password } : { username, password }
    );
    const request = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path: '/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (response) => {
      response.resume();
      response.on('end', () => resolve(response));
    });
    request.on('error', reject);
    request.end(body);
  });
}

async function withServer(callback) {
  const server = createTestServer();
  try {
    return await callback(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('cinco fallos para un usuario bloquean el sexto intento del mismo usuario', async () => {
  await withServer(async (server) => {
    for (let intento = 0; intento < 5; intento += 1) {
      assert.strictEqual((await request(server, 'UsuarioA')).statusCode, 401);
    }
    assert.strictEqual((await request(server, 'UsuarioA')).statusCode, 429);
  });
});

test('cambiar de usuario no bloquea mientras no se alcance el límite por IP', async () => {
  await withServer(async (server) => {
    for (let intento = 0; intento < 5; intento += 1) {
      assert.strictEqual((await request(server, 'UsuarioA')).statusCode, 401);
    }
    assert.strictEqual((await request(server, 'UsuarioB')).statusCode, 401);
  });
});

test('el límite por IP bloquea el intento 31 aunque cambie el usuario', async () => {
  await withServer(async (server) => {
    for (let intento = 0; intento < 30; intento += 1) {
      assert.strictEqual((await request(server, `usuario-${intento}`)).statusCode, 401);
    }
    assert.strictEqual((await request(server, 'usuario-31')).statusCode, 429);
  });
});

test('un login exitoso no consume el límite por usuario', async () => {
  await withServer(async (server) => {
    for (let intento = 0; intento < 4; intento += 1) {
      assert.strictEqual((await request(server, 'UsuarioExitoso')).statusCode, 401);
    }
    assert.strictEqual((await request(server, 'UsuarioExitoso', 'correcta')).statusCode, 200);
    assert.strictEqual((await request(server, 'UsuarioExitoso')).statusCode, 401);
    assert.strictEqual((await request(server, 'UsuarioExitoso')).statusCode, 429);
  });
});

test('sin username se aplica solamente el límite por IP', async () => {
  await withServer(async (server) => {
    for (let intento = 0; intento < 5; intento += 1) {
      assert.strictEqual((await request(server)).statusCode, 401);
    }
    assert.strictEqual((await request(server)).statusCode, 401);
  });
});
