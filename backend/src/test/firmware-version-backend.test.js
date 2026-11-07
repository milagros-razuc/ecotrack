const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '../../..');
const migrationDirectory = path.join(repositoryRoot, 'backend', 'migrations');
const aclPath = path.join(repositoryRoot, 'mosquitto', 'config', 'acl.conf');
const fakeIo = {
  to() {
    return { emit() {} };
  },
};

function loadMqttClientDoubles() {
  const servicePath = path.resolve(__dirname, '../services/dispositivos.service.js');
  const lecturasPath = path.resolve(__dirname, '../services/lecturas.service.js');
  const umbralesPath = path.resolve(__dirname, '../services/umbrales.service.js');
  const alertasPath = path.resolve(__dirname, '../services/alertas.service.js');
  const mqttPath = path.resolve(__dirname, '../mqtt/client.js');
  const calls = [];
  const readings = [];
  const subscriptions = [];
  const handlers = {};

  const install = (filePath, exports) => {
    require.cache[filePath] = {
      id: filePath,
      filename: filePath,
      loaded: true,
      exports,
    };
  };

  install(servicePath, {
    async obtenerContextoLectura() {
      return { activo: true, cliente_id: 10, reclamado_en: null };
    },
    async registrarConexion() {},
    async guardarReporteFirmware(report) {
      calls.push(report);
    },
  });
  install(lecturasPath, { async guardar(reading) { readings.push(reading); } });
  install(umbralesPath, { async obtener() { return null; } });
  install(alertasPath, { async registrar() { return { id: 1 }; } });
  require.cache[require.resolve('mqtt')] = {
    id: require.resolve('mqtt'),
    filename: require.resolve('mqtt'),
    loaded: true,
    exports: {
      connect() {
        return {
          on(event, handler) {
            handlers[event] = handler;
          },
          subscribe(topic, callback) {
            subscriptions.push(topic);
            callback(null);
          },
        };
      },
    },
  };

  delete require.cache[mqttPath];
  const mqttClient = require(mqttPath);
  return { mqttClient, calls, readings, subscriptions, handlers };
}

function assertSafeRealDatabase() {
  assert.ok(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL es obligatorio');
  const database = new URL(process.env.TEST_DATABASE_URL);
  assert.notEqual(database.port || '5432', '5432', 'No usar el puerto 5432 para tests reales');
  assert.match(database.pathname.slice(1), /_test$/, 'La base real debe terminar en _test');
  return database;
}

test('backend agrega una migración reversible para versión y fecha de firmware', () => {
  const migrations = fs.readdirSync(migrationDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const migration = migrations
    .map((name) => fs.readFileSync(path.join(migrationDirectory, name), 'utf8'))
    .find((sql) => /firmware_version/.test(sql));

  assert.ok(migration, 'falta una migración con firmware_version');
  assert.match(migration, /firmware_reported_at/);
  assert.match(migration, /DROP COLUMN IF EXISTS firmware_reported_at/i);
  assert.match(migration, /DROP COLUMN IF EXISTS firmware_version/i);
  assert.doesNotMatch(migration, /dispositivos_fabrica|device_secret|token_reclamo/i);
});

test('fw válido dentro de una lectura guarda versión y fecha del servidor', async () => {
  const { mqttClient, calls } = loadMqttClientDoubles();
  mqttClient.procesarMensaje(
    fakeIo,
    'ecotrack/DEV-A/lecturas',
    Buffer.from(JSON.stringify({
      temperatura: 20,
      humedad: 50,
      luminosidad: 50,
      fw: '1.2.3',
    })),
    new Date('2026-11-04T22:00:00.000Z'),
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, [{
    dispositivoCodigo: 'DEV-A',
    version: '1.2.3',
    reportadaEn: new Date('2026-11-04T22:00:00.000Z'),
  }]);
});

test('device_id del payload no es una fuente de identidad', async () => {
  const { mqttClient, calls } = loadMqttClientDoubles();
  await mqttClient.procesarMensaje(
    fakeIo,
    'ecotrack/DEV-A/lecturas',
    Buffer.from(JSON.stringify({
      temperatura: 20,
      humedad: 50,
      luminosidad: 50,
      fw: '2.0.0',
      device_id: 'DEV-B',
    })),
    new Date('2026-11-04T22:01:00.000Z'),
  );

  assert.equal(calls[0]?.dispositivoCodigo, 'DEV-A');
  assert.notEqual(calls[0]?.dispositivoCodigo, 'DEV-B');
});

test('el suscriptor solo usa el tópico de lecturas', () => {
  const { mqttClient, subscriptions, handlers } = loadMqttClientDoubles();
  process.env.MQTT_CA_PATH = path.join(repositoryRoot, 'backend', 'package.json');
  process.env.MQTT_HOST = 'test-host';
  process.env.MQTT_PORT = '8883';
  mqttClient({});
  handlers.connect();
  assert.deepEqual(subscriptions, ['ecotrack/+/lecturas']);
});

test('payload malformado no rompe el suscriptor ni registra secretos', async () => {
  const { mqttClient, calls } = loadMqttClientDoubles();
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  try {
    await assert.doesNotReject(() => mqttClient.procesarMensaje(
      fakeIo,
      'ecotrack/DEV-A/lecturas',
      Buffer.from('{"version":'),
    ));
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(calls, []);
  assert.doesNotMatch(errors.join('\n'), /device_secret|mqtt_pass|token|secret/i);
});

test('fw inválido se descarta sin perder la lectura', async () => {
  const { mqttClient, calls, readings } = loadMqttClientDoubles();
  await mqttClient.procesarMensaje(
    fakeIo,
    'ecotrack/DEV-A/lecturas',
    Buffer.from(JSON.stringify({
      temperatura: 20,
      humedad: 50,
      luminosidad: 50,
      fw: 'release-december',
    })),
  );
  assert.deepEqual(calls, []);
  assert.equal(readings.length, 1);
  assert.equal(readings[0].temperatura, 20);
});

for (const [label, fw] of [
  ['sufijo no SemVer', '1.2.3-dev'],
  ['valor numérico', 123],
  ['más de 50 caracteres', '1'.repeat(51)],
]) {
  test(`fw ${label} se descarta y conserva la lectura`, async () => {
    const { mqttClient, calls, readings } = loadMqttClientDoubles();
    await mqttClient.procesarMensaje(
      fakeIo,
      'ecotrack/DEV-A/lecturas',
      Buffer.from(JSON.stringify({
        temperatura: 20,
        humedad: 50,
        luminosidad: 50,
        fw,
      })),
    );
    assert.deepEqual(calls, []);
    assert.equal(readings.length, 1);
  });
}

test('reporte repetido actualiza y no duplica el dispositivo', async () => {
  const { mqttClient, calls } = loadMqttClientDoubles();
  for (const version of ['1.2.3', '1.2.4']) {
    await mqttClient.procesarMensaje(
      fakeIo,
      'ecotrack/DEV-A/lecturas',
      Buffer.from(JSON.stringify({
        temperatura: 20,
        humedad: 50,
        luminosidad: 50,
        fw: version,
      })),
      new Date('2026-11-04T22:02:00.000Z'),
    );
  }
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ dispositivoCodigo, version }) => ({ dispositivoCodigo, version })), [
    { dispositivoCodigo: 'DEV-A', version: '1.2.3' },
    { dispositivoCodigo: 'DEV-A', version: '1.2.4' },
  ]);
});

function loadRealDispositivosService() {
  const servicePath = path.resolve(__dirname, '../services/dispositivos.service.js');
  const dbPath = path.resolve(__dirname, '../config/db.js');
  delete require.cache[servicePath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      async query(sql, params) {
        assert.match(sql, /cliente_id = \$1/);
        assert.deepEqual(params, [10]);
        return {
          rows: [{
            codigo: 'DEV-A',
            cliente_id: 10,
            firmware_version: null,
            firmware_reported_at: null,
          }],
        };
      },
    },
  };
  return require(servicePath);
}

test('firmware viejo devuelve firmware_version desconocida y fecha null', async () => {
  const dispositivosService = loadRealDispositivosService();
  const result = await dispositivosService.formatearVersionFirmware({
    firmware_version: null,
    firmware_reported_at: null,
  });
  assert.deepEqual(result, {
    firmware_version: 'desconocida',
    firmware_reported_at: null,
  });
});

test('dueño A no ve dispositivos del dueño B', async () => {
  const dispositivosService = loadRealDispositivosService();
  const result = await dispositivosService.listarVersionesPorCliente(10);
  assert.deepEqual(result.map(({ codigo }) => codigo), ['DEV-A']);
});

test('ACL permite publicar solo el tópico de lecturas propio', () => {
  const acl = fs.readFileSync(aclPath, 'utf8');
  assert.match(acl, /topic write ecotrack\/ESP32-001\/lecturas/);
  assert.doesNotMatch(acl, /\/firmware/);
});

test('reporte de firmware persiste en PostgreSQL real', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const database = assertSafeRealDatabase();
  process.env.DB_HOST = database.hostname;
  process.env.DB_PORT = database.port || '5432';
  process.env.DB_NAME = database.pathname.slice(1);
  process.env.DB_USER = decodeURIComponent(database.username);
  process.env.DB_PASS = decodeURIComponent(database.password);

  const servicePath = path.resolve(__dirname, '../services/dispositivos.service.js');
  const lecturasPath = path.resolve(__dirname, '../services/lecturas.service.js');
  const umbralesPath = path.resolve(__dirname, '../services/umbrales.service.js');
  const alertasPath = path.resolve(__dirname, '../services/alertas.service.js');
  const dbPath = path.resolve(__dirname, '../config/db.js');
  const mqttPath = path.resolve(__dirname, '../mqtt/client.js');
  delete require.cache[mqttPath];
  delete require.cache[servicePath];
  delete require.cache[lecturasPath];
  delete require.cache[umbralesPath];
  delete require.cache[alertasPath];
  delete require.cache[dbPath];

  const pool = require('../config/db');
  const deviceCode = `REAL-FW-${Date.now()}`;
  const reportedAt = new Date('2026-11-04T22:30:00.000Z');
  await pool.query(
    `INSERT INTO dispositivos (codigo, nombre, ubicacion, activo, cliente_id)
     VALUES ($1, 'Real firmware', 'Test', true, 1)`,
    [deviceCode],
  );
  try {
    const { procesarMensaje } = require('../mqtt/client');
    await procesarMensaje(
      fakeIo,
      `ecotrack/${deviceCode}/lecturas`,
      Buffer.from(JSON.stringify({
        temperatura: 20,
        humedad: 50,
        luminosidad: 50,
        fw: '3.4.5',
      })),
      reportedAt,
    );
    const { rows } = await pool.query(
      'SELECT firmware_version, firmware_reported_at FROM dispositivos WHERE codigo = $1',
      [deviceCode],
    );
    assert.deepEqual(rows[0], {
      firmware_version: '3.4.5',
      firmware_reported_at: reportedAt,
    });

    const beforeInvalid = await pool.query(
      'SELECT COUNT(*)::int AS count FROM lecturas WHERE dispositivo_codigo = $1',
      [deviceCode],
    );
    for (const fw of ['1.2.3-dev', 123, '1'.repeat(51)]) {
      await procesarMensaje(
        fakeIo,
        `ecotrack/${deviceCode}/lecturas`,
        Buffer.from(JSON.stringify({
          temperatura: 21,
          humedad: 51,
          luminosidad: 51,
          fw,
        })),
        reportedAt,
      );
    }
    const afterInvalid = await pool.query(
      'SELECT COUNT(*)::int AS count FROM lecturas WHERE dispositivo_codigo = $1',
      [deviceCode],
    );
    assert.equal(afterInvalid.rows[0].count - beforeInvalid.rows[0].count, 3);
    const unchanged = await pool.query(
      'SELECT firmware_version, firmware_reported_at FROM dispositivos WHERE codigo = $1',
      [deviceCode],
    );
    assert.deepEqual(unchanged.rows[0], {
      firmware_version: '3.4.5',
      firmware_reported_at: reportedAt,
    });
  } finally {
    await pool.query('DELETE FROM lecturas WHERE dispositivo_codigo = $1', [deviceCode]);
    await pool.query('DELETE FROM dispositivos WHERE codigo = $1', [deviceCode]);
    await pool.end();
  }
});

test('aislamiento real: cliente A no ve versiones de dispositivos del cliente B', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const database = assertSafeRealDatabase();
  process.env.DB_HOST = database.hostname;
  process.env.DB_PORT = database.port || '5432';
  process.env.DB_NAME = database.pathname.slice(1);
  process.env.DB_USER = decodeURIComponent(database.username);
  process.env.DB_PASS = decodeURIComponent(database.password);

  const servicePath = path.resolve(__dirname, '../services/dispositivos.service.js');
  const dbPath = path.resolve(__dirname, '../config/db.js');
  delete require.cache[servicePath];
  delete require.cache[dbPath];
  const pool = require('../config/db');
  const suffix = Date.now();
  const deviceA = `REAL-A-${suffix}`;
  const deviceB = `REAL-B-${suffix}`;
  const clients = await pool.query(
    'INSERT INTO clientes (nombre) VALUES ($1) RETURNING id',
    [`Firmware A ${suffix}`],
  );
  const clientB = await pool.query(
    'INSERT INTO clientes (nombre) VALUES ($1) RETURNING id',
    [`Firmware B ${suffix}`],
  );
  await pool.query(
    `INSERT INTO dispositivos
      (codigo, nombre, ubicacion, activo, cliente_id, firmware_version, firmware_reported_at)
     VALUES ($1, 'A', 'Test', true, $3, '1.0.0', NOW()),
            ($2, 'B', 'Test', true, $4, '9.9.9', NOW())`,
    [deviceA, deviceB, clients.rows[0].id, clientB.rows[0].id],
  );
  try {
    const dispositivosService = require('../services/dispositivos.service');
    const visible = await dispositivosService.listarVersionesPorCliente(clients.rows[0].id);
    assert.deepEqual(visible.map(({ codigo, firmware_version }) => ({
      codigo,
      firmware_version,
    })), [{ codigo: deviceA, firmware_version: '1.0.0' }]);
  } finally {
    await pool.query('DELETE FROM dispositivos WHERE codigo = ANY($1::text[])', [[deviceA, deviceB]]);
    await pool.query('DELETE FROM clientes WHERE id = $1', [clients.rows[0].id]);
    await pool.query('DELETE FROM clientes WHERE id = $1', [clientB.rows[0].id]);
    await pool.end();
  }
});
