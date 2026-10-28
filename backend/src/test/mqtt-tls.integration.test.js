const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const test = require('node:test');
const tls = require('tls');
const mqtt = require('mqtt');

const HOST = 'localhost';
const PORT = 18883;
const MQTT_URL = `mqtts://${HOST}:${PORT}`;
const TEST_PASSWORD = 'testpass123';
const CA_PATH = path.resolve(__dirname, '../../../mosquitto/config/certs/ecotrack-ca.crt');
const CONFIG_DIR = path.resolve(__dirname, '../../../mosquitto/config');
const CLIENT_PATH = path.resolve(__dirname, '../mqtt/client.js');
const CONTAINER_NAME = `ecotrack-mqtt-tls-${process.pid}-${Date.now()}`;

function dockerCommand(args) {
  return spawnSync(process.platform === 'win32' ? 'docker.exe' : 'docker', args, {
    encoding: 'utf8',
    windowsHide: true,
  });
}

function dockerAvailable() {
  return dockerCommand(['info']).status === 0;
}

function waitForTlsPort(timeoutMs = 10000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = tls.connect({
        host: HOST,
        port: PORT,
        ca: fs.readFileSync(CA_PATH),
        servername: HOST,
        rejectUnauthorized: true,
      });
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (!error) {
          resolve();
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`El puerto TLS ${PORT} no acepto conexiones dentro de ${timeoutMs} ms`));
          return;
        }
        setTimeout(attempt, 100);
      };
      socket.once('secureConnect', () => finish());
      socket.once('error', () => finish(new Error('Puerto TLS aun no disponible')));
      socket.setTimeout(500, () => finish(new Error('Timeout esperando el puerto TLS')));
    };
    attempt();
  });
}

function startBroker() {
  const result = dockerCommand([
    'run',
    '--rm',
    '-d',
    '--name',
    CONTAINER_NAME,
    '-p',
    `${PORT}:18883`,
    '-v',
    `${CONFIG_DIR}:/src:ro`,
    'eclipse-mosquitto:2',
    'sh',
    '-c',
    'mkdir -p /tmp/cfg && cp -r /src/. /tmp/cfg/ && chown -R mosquitto:mosquitto /tmp/cfg && chmod 0600 /tmp/cfg/passwd.test /tmp/cfg/acl.test.conf && sed \'s#/mosquitto/config#/tmp/cfg#g\' /tmp/cfg/mosquitto.test.conf > /tmp/cfg/run.conf && mosquitto -c /tmp/cfg/run.conf',
  ]);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
}

function stopBroker() {
  dockerCommand(['rm', '-f', CONTAINER_NAME]);
}

function connectClient(options = {}) {
  return mqtt.connect(MQTT_URL, {
    username: 'backend',
    password: TEST_PASSWORD,
    reconnectPeriod: 0,
    connectTimeout: 5000,
    ...options,
  });
}

function waitForEvent(emitter, eventName, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.removeListener(eventName, onEvent);
      reject(new Error(`No se recibio ${eventName} dentro de ${timeoutMs} ms`));
    }, timeoutMs);
    const onEvent = (...args) => {
      clearTimeout(timer);
      resolve(args);
    };
    emitter.once(eventName, onEvent);
  });
}

function closeClient(client) {
  return new Promise((resolve) => {
    if (!client || client.disconnected) {
      resolve();
      return;
    }
    client.end(true, resolve);
  });
}

async function assertConnectionFailure(options, expectedPattern) {
  const client = connectClient(options);
  try {
    const [error] = await waitForEvent(client, 'error');
    assert.match(error.message, expectedPattern);
  } finally {
    await closeClient(client);
  }
}

test('TLS MQTT: valida CA y hostname del certificado del broker', async (context) => {
  if (!dockerAvailable()) {
    context.skip('Docker no esta disponible para la prueba de integracion TLS MQTT');
    return;
  }
  assert.ok(fs.existsSync(CA_PATH), `No existe el CA de prueba: ${CA_PATH}`);

  let validClient;
  try {
    startBroker();
    await waitForTlsPort();

    validClient = connectClient({
      ca: fs.readFileSync(CA_PATH),
      rejectUnauthorized: true,
      servername: 'localhost',
    });
    await waitForEvent(validClient, 'connect');

    await assertConnectionFailure({ rejectUnauthorized: true }, /self-signed|unable to verify|certificate/i);
    await assertConnectionFailure({
      ca: Buffer.from('not-a-certificate'),
      rejectUnauthorized: true,
      servername: 'localhost',
    }, /self-signed|unable to verify|certificate/i);
    await assertConnectionFailure({
      ca: fs.readFileSync(CA_PATH),
      rejectUnauthorized: true,
      servername: '127.0.0.1',
      host: '127.0.0.1',
    }, /hostname|IP|certificate/i);
  } finally {
    await closeClient(validClient);
    stopBroker();
  }
});

test('TLS MQTT: el cliente backend exige configuración segura', () => {
  const source = fs.readFileSync(CLIENT_PATH, 'utf8');
  assert.doesNotMatch(source, /mqtt:\/\//);
  assert.doesNotMatch(source, /1883/);
  assert.doesNotMatch(source, /rejectUnauthorized\s*:\s*false/);
  assert.match(source, /mqtts:\/\//);
  assert.match(source, /MQTT_CA_PATH/);
  assert.match(source, /rejectUnauthorized\s*:\s*true/);
});
