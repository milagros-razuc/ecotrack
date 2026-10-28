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
const CONTAINER_NAME = `ecotrack-mqtt-acl-${process.pid}-${Date.now()}`;

function dockerCommand(args) {
  return spawnSync(process.platform === 'win32' ? 'docker.exe' : 'docker', args, {
    encoding: 'utf8',
    windowsHide: true,
  });
}

function dockerAvailable() {
  const result = dockerCommand(['info']);
  return result.status === 0;
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

function connectClient(username) {
  return mqtt.connect(MQTT_URL, {
    username,
    password: TEST_PASSWORD,
    ca: fs.readFileSync(CA_PATH),
    rejectUnauthorized: true,
    reconnectPeriod: 0,
    connectTimeout: 5000,
  });
}

function waitForEvent(emitter, eventName, timeoutMs = 5000) {
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

function waitForConnect(client) {
  if (client.connected) return Promise.resolve();
  return waitForEvent(client, 'connect');
}

function publish(client, topic, payload) {
  return new Promise((resolve, reject) => {
    client.publish(topic, payload, { qos: 0 }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
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

test('ACL MQTT: permite el tópico propio y descarta el tópico de otro dispositivo', async (context) => {
  if (!dockerAvailable()) {
    context.skip('Docker no esta disponible para la prueba de integracion MQTT');
    return;
  }
  assert.ok(fs.existsSync(CA_PATH), `No existe el CA de prueba: ${CA_PATH}`);

  let backend;
  let deviceA;
  let deviceB;
  const received = [];
  const onMessage = (topic, message) => {
    received.push({ topic, payload: message.toString() });
  };

  try {
    startBroker();
    await waitForTlsPort();
    backend = connectClient('backend');
    deviceA = connectClient('test-a');
    deviceB = connectClient('test-b');
    backend.on('message', onMessage);
    await Promise.all([waitForConnect(backend), waitForConnect(deviceA), waitForConnect(deviceB)]);

    await new Promise((resolve, reject) => {
      backend.subscribe('ecotrack/+/lecturas', (error) => (error ? reject(error) : resolve()));
    });

    const ownPayload = JSON.stringify({
      temperatura: 21.1,
      humedad: 45,
      luminosidad: 61,
      testId: `own-${Date.now()}`,
    });
    const crossPayload = JSON.stringify({
      temperatura: 99.9,
      humedad: 1,
      luminosidad: 2,
      testId: `cross-${Date.now()}`,
    });

    const ownMessage = waitForEvent(backend, 'message');
    await publish(deviceA, 'ecotrack/TEST-A/lecturas', ownPayload);
    await ownMessage;
    assert.deepStrictEqual(received, [{
      topic: 'ecotrack/TEST-A/lecturas',
      payload: ownPayload,
    }]);

    await publish(deviceA, 'ecotrack/TEST-B/lecturas', crossPayload);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.deepStrictEqual(received, [{
      topic: 'ecotrack/TEST-A/lecturas',
      payload: ownPayload,
    }]);
  } finally {
    if (backend) backend.off('message', onMessage);
    await Promise.all([closeClient(backend), closeClient(deviceA), closeClient(deviceB)]);
    stopBroker();
  }
});
