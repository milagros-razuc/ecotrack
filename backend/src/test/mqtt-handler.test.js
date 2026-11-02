const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const servicePaths = {
  dispositivos: path.resolve(__dirname, '../services/dispositivos.service.js'),
  lecturas: path.resolve(__dirname, '../services/lecturas.service.js'),
  umbrales: path.resolve(__dirname, '../services/umbrales.service.js'),
  alertas: path.resolve(__dirname, '../services/alertas.service.js'),
  mqttClient: path.resolve(__dirname, '../mqtt/client.js'),
};

const calls = [];
let contexto = { activo: true, cliente_id: 10, reclamado_en: null };
let umbral = null;
let mqttHandlers;
let subscriptions;

const fakeMqtt = {
  connect() {
    mqttHandlers = {};
    subscriptions = [];
    return {
      on(event, handler) {
        mqttHandlers[event] = handler;
      },
      subscribe(topic, callback) {
        subscriptions.push(topic);
        callback(null);
      },
    };
  },
};

function installDoubles() {
  require.cache[servicePaths.dispositivos] = {
    id: servicePaths.dispositivos,
    filename: servicePaths.dispositivos,
    loaded: true,
    exports: {
      async obtenerContextoLectura() {
        calls.push('contexto');
        return contexto;
      },
      async registrarConexion(codigo, timestamp) {
        calls.push({ type: 'conexion', codigo, timestamp });
      },
    },
  };
  require.cache[servicePaths.lecturas] = {
    id: servicePaths.lecturas,
    filename: servicePaths.lecturas,
    loaded: true,
    exports: {
      async guardar(payload) {
        calls.push({ type: 'guardar', payload });
      },
    },
  };
  require.cache[servicePaths.umbrales] = {
    id: servicePaths.umbrales,
    filename: servicePaths.umbrales,
    loaded: true,
    exports: {
      async obtener() {
        calls.push('umbral');
        return umbral;
      },
    },
  };
  require.cache[servicePaths.alertas] = {
    id: servicePaths.alertas,
    filename: servicePaths.alertas,
    loaded: true,
    exports: {
      async registrar(payload) {
        calls.push({ type: 'alerta', payload });
        return { alerta: { id: 1 } };
      },
    },
  };
  require.cache[require.resolve('mqtt')] = {
    id: require.resolve('mqtt'),
    filename: require.resolve('mqtt'),
    loaded: true,
    exports: fakeMqtt,
  };
}

installDoubles();
delete require.cache[servicePaths.mqttClient];
const iniciarMQTT = require('../mqtt/client');
const { procesarMensaje } = iniciarMQTT;

const fixedReception = new Date('2026-10-31T16:30:00.000Z');
const validPayload = {
  temperatura: 20,
  humedad: 50,
  luminosidad: 50,
};

function reset({ deviceContext = { activo: true, cliente_id: 10, reclamado_en: null }, threshold = null } = {}) {
  calls.length = 0;
  contexto = deviceContext;
  umbral = threshold;
}

function fakeIo() {
  const emitted = [];
  return {
    emitted,
    to(room) {
      return {
        emit(event, payload) {
          emitted.push({ room, event, payload });
        },
      };
    },
  };
}

test('CP-RF04 iniciarMQTT se suscribe a ecotrack/+/lecturas con cliente falso', () => {
  process.env.MQTT_CA_PATH = path.resolve(__dirname, '../../package.json');
  process.env.MQTT_HOST = 'fake-host';
  process.env.MQTT_PORT = '8883';

  iniciarMQTT(fakeIo());
  mqttHandlers.connect();

  assert.deepEqual(subscriptions, ['ecotrack/+/lecturas']);
  assert.equal(typeof mqttHandlers.message, 'function');
  assert.equal(typeof mqttHandlers.connect, 'function');
});

test('CP-RF04 JSON inválido se descarta sin lanzar excepción ni persistir', async () => {
  reset();
  await assert.doesNotReject(() => procesarMensaje(
    fakeIo(),
    'ecotrack/DEV-A/lecturas',
    Buffer.from('{no-json'),
    fixedReception
  ));
  assert.deepEqual(calls, []);
});

test('CP-RF04 payload inválido se descarta sin persistir', async () => {
  reset();
  await procesarMensaje(
    fakeIo(),
    'ecotrack/DEV-A/lecturas',
    Buffer.from(JSON.stringify({ temperatura: '20', humedad: 50, luminosidad: 500 })),
    fixedReception
  );
  assert.deepEqual(calls, []);
});

test('CP-RF05 dispositivo desconocido se descarta sin persistir y registra la conexión MQTT', async () => {
  reset({ deviceContext: null });
  await procesarMensaje(fakeIo(), 'ecotrack/UNKNOWN/lecturas', Buffer.from(JSON.stringify(validPayload)), fixedReception);
  assert.equal(calls[0], 'contexto');
  assert.deepEqual(calls[1], { type: 'conexion', codigo: 'UNKNOWN', timestamp: fixedReception });
  assert.equal(calls.some(call => call.type === 'guardar'), false);
});

test('CP-RF05 dispositivo inactivo se descarta sin persistir ni alertar', async () => {
  reset({ deviceContext: { activo: false, cliente_id: 10, reclamado_en: null } });
  await procesarMensaje(fakeIo(), 'ecotrack/DEV-A/lecturas', Buffer.from(JSON.stringify(validPayload)), fixedReception);
  assert.deepEqual(calls, ['contexto']);
});

test('CP-RF05 dispositivo sin dueño actualiza conexión y descarta la lectura', async () => {
  reset({ deviceContext: { activo: true, cliente_id: null, reclamado_en: null } });
  await procesarMensaje(fakeIo(), 'ecotrack/DEV-A/lecturas', Buffer.from(JSON.stringify(validPayload)), fixedReception);
  assert.equal(calls[0], 'contexto');
  assert.deepEqual(calls[1], { type: 'conexion', codigo: 'DEV-A', timestamp: fixedReception });
  assert.equal(calls.some(call => call.type === 'guardar'), false);
});

test('CP-RF05 extrae el código del dispositivo del tópico y persiste antes de evaluar alertas', async () => {
  reset({ threshold: { umbral_min: 10, umbral_max: 15, notificaciones_activas: true } });
  const io = fakeIo();
  await procesarMensaje(io, 'ecotrack/DEV-A/lecturas', Buffer.from(JSON.stringify(validPayload)), fixedReception);

  const connectionIndex = calls.findIndex(call => call.type === 'conexion');
  const saveIndex = calls.findIndex(call => call.type === 'guardar');
  const thresholdIndex = calls.findIndex(call => call === 'umbral');
  const alertIndex = calls.findIndex(call => call.type === 'alerta');

  assert.equal(calls[connectionIndex].codigo, 'DEV-A');
  assert.ok(connectionIndex < saveIndex);
  assert.ok(saveIndex < thresholdIndex);
  assert.ok(thresholdIndex < alertIndex);
  assert.equal(calls[saveIndex].payload.dispositivoCodigo, 'DEV-A');
  assert.equal(calls[saveIndex].payload.timestamp, fixedReception);
});

test('CP-RF05 lectura válida actualiza ultima_conexion con la hora recibida', async () => {
  reset();
  await procesarMensaje(fakeIo(), 'ecotrack/DEV-A/lecturas', Buffer.from(JSON.stringify(validPayload)), fixedReception);
  const connection = calls.find(call => call.type === 'conexion');
  assert.deepEqual(connection, { type: 'conexion', codigo: 'DEV-A', timestamp: fixedReception });
});
