const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const test = require('node:test');

const { configureProxyTrust } = require('../app');

test('trust proxy reconoce HTTPS reenviado por el proxy de un salto', async () => {
  const app = configureProxyTrust(express());
  app.get('/probe', (req, res) => res.json({ secure: req.secure, ip: req.ip }));
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const secure = await new Promise((resolve, reject) => {
      const request = http.request({
        port: server.address().port,
        path: '/probe',
        headers: {
          'x-forwarded-for': '198.51.100.24',
          'x-forwarded-proto': 'https',
        },
      }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve(JSON.parse(body)));
      });
      request.on('error', reject);
      request.end();
    });
    assert.equal(secure.secure, true);
    assert.equal(secure.ip, '198.51.100.24');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
