const assert = require('assert');
const test = require('node:test');
const { createRealtimeFixture } = require('./realtime.test-support');

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL es obligatorio para ejecutar aislamiento-historico-dispositivo.integration.test.js');
}

let fixture;
let dispositivosService;
let lecturasService;
let alertasService;

test.before(async () => {
  fixture = await createRealtimeFixture();
  dispositivosService = require('../services/dispositivos.service');
  lecturasService = require('../services/lecturas.service');
  alertasService = require('../services/alertas.service');
});

test.after(async () => {
  await fixture.close();
});

test('US3: la transferencia conserva el historico de A y aisla los datos de B', async () => {
  const { a, b } = fixture.seed.clients;
  const deviceCode = fixture.seed.devices.a;

  await fixture.pool.query(
    `INSERT INTO umbrales
      (dispositivo_codigo, variable, umbral_min, umbral_max, notificaciones_activas)
     VALUES ($1, 'temperatura', 0, 20, true)`,
    [deviceCode]
  );
  await fixture.procesarMensaje(
    `ecotrack/${deviceCode}/lecturas`,
    JSON.stringify({ temperatura: 24, humedad: 47, luminosidad: 65 })
  );

  const historicalReadings = await lecturasService.listar({ dispositivo: deviceCode, clienteId: a.id });
  const historicalAlerts = await alertasService.listar({ dispositivo: deviceCode, clienteId: a.id });
  assert.strictEqual(historicalReadings.length, 1);
  assert.strictEqual(historicalAlerts.total, 1);

  const released = await dispositivosService.eliminar(deviceCode, a.id);
  assert.deepStrictEqual(released, { codigo: deviceCode });

  const { rows: releasedDevice } = await fixture.pool.query(
    'SELECT cliente_id, activo FROM dispositivos WHERE codigo = $1',
    [deviceCode]
  );
  const { rows: releasedThresholds } = await fixture.pool.query(
    'SELECT 1 FROM umbrales WHERE dispositivo_codigo = $1',
    [deviceCode]
  );
  assert.strictEqual(releasedDevice[0].cliente_id, null);
  assert.strictEqual(releasedDevice[0].activo, false);
  assert.strictEqual(releasedThresholds.length, 0);

  const claimed = await dispositivosService.crearOActualizar({
    codigo: deviceCode,
    nombre: 'Dispositivo B',
    ubicacion: 'Test B',
    clienteId: b.id,
  });
  assert.deepStrictEqual(claimed, { ok: true });

  await fixture.procesarMensaje(
    `ecotrack/${deviceCode}/lecturas`,
    JSON.stringify({ temperatura: 18, humedad: 52, luminosidad: 70 })
  );

  const clientAReadings = await lecturasService.listar({ dispositivo: deviceCode, clienteId: a.id });
  const clientBReadings = await lecturasService.listar({ dispositivo: deviceCode, clienteId: b.id });
  const clientAAlerts = await alertasService.listar({ dispositivo: deviceCode, clienteId: a.id });
  const clientBAlerts = await alertasService.listar({ dispositivo: deviceCode, clienteId: b.id });

  assert.strictEqual(clientAReadings.length, 1);
  assert.strictEqual(clientBReadings.length, 1);
  assert.strictEqual(clientAAlerts.total, 1);
  assert.strictEqual(clientBAlerts.total, 0);
});
