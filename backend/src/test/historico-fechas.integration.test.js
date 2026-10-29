const assert = require('assert');
const test = require('node:test');
const { createRealtimeFixture } = require('./realtime.test-support');

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL es obligatorio para ejecutar historico-fechas.integration.test.js');
}

let fixture;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days) {
  return new Date(Date.now() - days * DAY_MS);
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

const readingDates = {
  older: daysAgo(10),
  newer: daysAgo(5),
  otherClient: daysAgo(10),
};

test.before(async () => {
  fixture = await createRealtimeFixture();
  const { devices, clients } = fixture.seed;
  await fixture.pool.query(
    `INSERT INTO lecturas
      (dispositivo_codigo, temperatura, humedad, luminosidad, timestamp, cliente_id)
     VALUES
      ($1, 21, 40, 50, $5, $3),
      ($1, 22, 41, 51, $6, $3),
      ($2, 23, 42, 52, $7, $4)`,
    [
      devices.a,
      devices.b,
      clients.a.id,
      clients.b.id,
      readingDates.older,
      readingDates.newer,
      readingDates.otherClient,
    ]
  );
});

test.after(async () => {
  await fixture.close();
});

async function consultar(endpoint, cliente, query) {
  const token = fixture.signToken(fixture.seed.users[cliente]);
  const url = new URL(`/api/lecturas/${endpoint}`, `http://127.0.0.1:${fixture.server.address().port}`);
  url.search = new URLSearchParams(query);
  return fetch(url, { headers: { Authorization: token } });
}

test('filtra lecturas y agregados por rango inclusive', async () => {
  const lecturas = await consultar('', 'a', {
    fechaDesde: dateOnly(readingDates.older),
    fechaHasta: dateOnly(readingDates.older),
  });
  assert.strictEqual(lecturas.status, 200);
  const lecturasBody = await lecturas.json();
  assert.strictEqual(lecturasBody.length, 1);
  assert.strictEqual(lecturasBody[0].cliente_id, fixture.seed.clients.a.id);

  const agregado = await consultar('agregado', 'a', {
    periodo: 'mes',
    fechaDesde: dateOnly(readingDates.older),
    fechaHasta: dateOnly(readingDates.older),
  });
  assert.strictEqual(agregado.status, 200);
  assert.strictEqual((await agregado.json()).length, 1);
});

test('devuelve 200 vacío cuando el rango no tiene datos', async () => {
  const emptyDate = dateOnly(daysAgo(3));
  const response = await consultar('', 'a', {
    fechaDesde: emptyDate,
    fechaHasta: emptyDate,
  });
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), []);
});

test('rechaza desde posterior a hasta y rangos mayores a 366 días', async () => {
  const fechaDesde = dateOnly(daysAgo(1));
  const fechaHasta = dateOnly(daysAgo(2));
  const fechaAntigua = dateOnly(daysAgo(400));
  const fechaReciente = dateOnly(daysAgo(30));

  for (const endpoint of ['', 'agregado']) {
    const invertido = await consultar(endpoint, 'a', {
      fechaDesde,
      fechaHasta,
    });
    assert.strictEqual(invertido.status, 400);
    assert.match((await invertido.json()).error, /posterior/);

    const demasiadoLargo = await consultar(endpoint, 'a', {
      fechaDesde: fechaAntigua,
      fechaHasta: fechaReciente,
    });
    assert.strictEqual(demasiadoLargo.status, 400);
    assert.match((await demasiadoLargo.json()).error, /366 días/);
  }
});

test('no expone lecturas de otro cliente', async () => {
  const response = await consultar('', 'a', {
    dispositivo: fixture.seed.devices.b,
    fechaDesde: dateOnly(readingDates.otherClient),
    fechaHasta: dateOnly(readingDates.otherClient),
  });
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), []);
});
