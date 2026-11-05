const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const test = require('node:test');

const { createResetCredencialesRouter } = require('../routes/dispositivos');
const {
  ResetCredencialesError,
} = require('../services/resetCredenciales.service');

function request(router, usuario) {
  const app = express();
  app.use((req, _res, next) => {
    req.usuario = usuario;
    req.clienteId = 10;
    next();
  });
  app.use(router);
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      const request = http.request({
        port: server.address().port,
        method: 'POST',
        path: '/DEVICE-A/reset-credenciales',
      }, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          server.close(() => resolve({
            status: response.statusCode,
            body: body ? JSON.parse(body) : null,
          }));
        });
      });
      request.on('error', (error) => server.close(() => reject(error)));
      request.end();
    });
  });
}

test('el endpoint exige admin y usa el cliente de la sesión', async () => {
  const calls = [];
  const router = createResetCredencialesRouter({
    async resetearCredenciales(input) {
      calls.push(input);
      return { status: 'reset', device_id: input.deviceId };
    },
  });

  const forbidden = await request(router, { rol: 'comun' });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(calls, []);

  const allowed = await request(router, { rol: 'admin' });
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body, { ok: true, status: 'reset', device_id: 'DEVICE-A' });
  assert.deepEqual(calls, [{ deviceId: 'DEVICE-A', clienteId: 10 }]);
});

test('el endpoint no expone detalles de dynsec', async () => {
  const router = createResetCredencialesRouter({
    async resetearCredenciales() {
      throw new ResetCredencialesError();
    },
  });

  const response = await request(router, { rol: 'admin' });
  assert.deepEqual(response, {
    status: 409,
    body: { error: 'No se pudo resetear las credenciales del dispositivo' },
  });
});
