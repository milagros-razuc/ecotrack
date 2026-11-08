const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const http = require('node:http');
const app = require('../app');
const { createReadLimiter } = require('../routes/plataforma');

test('los límites de lectura y reset tienen contadores y valores separados', () => {
  const config = require('../config/platformPanelConfig');
  assert.equal(config.rateLimits.reset.max, 10);
  assert.equal(config.rateLimits.reset.windowMs, 15 * 60 * 1000);
  assert.equal(config.rateLimits.read.max, 300);
  assert.equal(config.rateLimits.read.windowMs, 15 * 60 * 1000);
  assert.notEqual(config.rateLimits.reset.counterKey, config.rateLimits.read.counterKey);
});

test('los límites aceptan overrides por entorno', () => {
  const modulePath = require.resolve('../config/platformPanelConfig');
  process.env.PLATFORM_RESET_RATE_LIMIT_MAX = '5';
  process.env.PLATFORM_READ_RATE_LIMIT_MAX = '500';
  delete require.cache[modulePath];
  const config = require(modulePath);
  assert.equal(config.rateLimits.reset.max, 5);
  assert.equal(config.rateLimits.read.max, 500);
  delete process.env.PLATFORM_RESET_RATE_LIMIT_MAX;
  delete process.env.PLATFORM_READ_RATE_LIMIT_MAX;
});

test('readLimiter responde 429 y la aplicación confía en un salto de proxy', async () => {
  assert.equal(app.get('trust proxy'), 1);
  const serverApp = express();
  serverApp.get('/read', createReadLimiter({ max: 1, windowMs: 60_000 }), (req, res) => res.sendStatus(200));
  const server = http.createServer(serverApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const get = () => new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}/read`, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
  });
  try {
    assert.equal(await get(), 200);
    assert.equal(await get(), 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
