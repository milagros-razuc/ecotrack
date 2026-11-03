const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const test = require('node:test');

const { configureProxyTrust } = require('../app');

test('trust proxy reconoce HTTPS reenviado por el proxy de un salto', async () => {
  const app = configureProxyTrust(express());
  app.get('/probe', (req, res) => res.json({ secure: req.secure }));
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const secure = await new Promise((resolve, reject) => {
      const request = http.request({
        port: server.address().port,
        path: '/probe',
        headers: { 'x-forwarded-proto': 'https' },
      }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve(JSON.parse(body).secure));
      });
      request.on('error', reject);
      request.end();
    });
    assert.equal(secure, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
