const assert = require('assert');
const test = require('node:test');
const { once } = require('events');
const { io } = require('socket.io-client');
const { createRealtimeFixture } = require('./realtime.test-support');

test('fixture realtime: token valido conecta y token ausente es rechazado', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('Configure TEST_DATABASE_URL para ejecutar el smoke test realtime');
    return;
  }

  const fixture = await createRealtimeFixture();
  const port = fixture.server.address().port;
  const url = `http://127.0.0.1:${port}`;
  const validSocket = io(url, {
    auth: { token: fixture.signToken(fixture.seed.users.a) },
    reconnection: false,
  });
  const anonymousSocket = io(url, { reconnection: false });

  try {
    await once(validSocket, 'connect');
    assert.strictEqual(validSocket.connected, true);

    const [error] = await once(anonymousSocket, 'connect_error');
    assert.strictEqual(error.data.code, 'AUTHENTICATION_ERROR');
    assert.strictEqual(anonymousSocket.connected, false);
  } finally {
    validSocket.close();
    anonymousSocket.close();
    await fixture.close();
  }
});
