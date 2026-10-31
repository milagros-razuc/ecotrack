const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../config/db.js');
const accionesPath = path.resolve(__dirname, '../services/alerta-acciones.service.js');
const dispositivosPath = path.resolve(__dirname, '../services/dispositivos.service.js');
const lecturasPath = path.resolve(__dirname, '../services/lecturas.service.js');
const umbralesPath = path.resolve(__dirname, '../services/umbrales.service.js');
const alertasPath = path.resolve(__dirname, '../services/alertas.service.js');

const queries = [];
const emittedActions = [];
const actionRows = [];
const alerts = new Map();
let nextAlertId = 1;
let thresholdByVariable = new Map();
let deviceContext = { activo: true, cliente_id: 10, reclamado_en: null };

const fakeClient = {
  async query(sql, params = []) {
    queries.push({ sql, params });

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT INTO alertas')) {
      if (deviceContext.cliente_id === null) return { rows: [], rowCount: 0 };
      const alerta = {
        id: nextAlertId++,
        dispositivo_codigo: params[0],
        variable: params[1],
        valor: params[2],
        umbral_min: params[3],
        umbral_max: params[4],
        estado: 'pendiente',
        cliente_id: deviceContext.cliente_id,
        timestamp: new Date('2026-01-01T12:00:00.000Z'),
      };
      alerts.set(alerta.id, alerta);
      return { rows: [alerta], rowCount: 1 };
    }
    if (sql.includes('SELECT * FROM alertas') && sql.includes('FOR UPDATE')) {
      const alerta = alerts.get(Number(params[0]));
      if (!alerta || alerta.cliente_id !== params[1]) return { rows: [], rowCount: 0 };
      return { rows: [alerta], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE alertas SET estado')) {
      const alerta = alerts.get(Number(params[1]));
      alerta.estado = params[0];
      alerta.comentario = params.length === 4 ? params[3] : alerta.comentario;
      return { rows: [alerta], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  },
  release() {},
};

const fakePool = {
  async query(sql, params = []) {
    queries.push({ sql, params });
    if (sql.includes('SELECT COUNT(*) FROM alertas')) {
      return { rows: [{ count: String(alerts.size) }] };
    }
    if (sql.includes('SELECT a.*, d.nombre')) {
      return { rows: [...alerts.values()] };
    }
    if (sql.includes('SELECT * FROM alertas')) {
      const alerta = alerts.get(Number(params[0]));
      return { rows: alerta && alerta.cliente_id === params[1] ? [alerta] : [] };
    }
    if (sql.includes('GROUP BY a.variable')) {
      return { rows: [{ variable: 'temperatura', cantidad: '2' }] };
    }
    return { rows: [] };
  },
  async connect() {
    return fakeClient;
  },
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: fakePool,
};
require.cache[accionesPath] = {
  id: accionesPath,
  filename: accionesPath,
  loaded: true,
  exports: {
    async insertar(_client, data) {
      const accion = { id: actionRows.length + 1, ...data };
      actionRows.push(accion);
      return accion;
    },
  },
};

const alertasService = require('../services/alertas.service');
const savedReadings = [];
require.cache[dispositivosPath] = {
  id: dispositivosPath,
  filename: dispositivosPath,
  loaded: true,
  exports: {
    async obtenerContextoLectura() {
      return deviceContext;
    },
    async registrarConexion() {},
  },
};
require.cache[lecturasPath] = {
  id: lecturasPath,
  filename: lecturasPath,
  loaded: true,
  exports: {
    async guardar(reading) {
      savedReadings.push(reading);
    },
  },
};
require.cache[umbralesPath] = {
  id: umbralesPath,
  filename: umbralesPath,
  loaded: true,
  exports: {
    async obtener(_dispositivoCodigo, variable) {
      return thresholdByVariable.get(variable) || null;
    },
  },
};
const { procesarMensaje } = require('../mqtt/client');
const fakeIo = {
  emitted: [],
  to() {
    return {
      emit: (event, payload) => fakeIo.emitted.push({ event, payload }),
    };
  },
};

function reset() {
  queries.length = 0;
  emittedActions.length = 0;
  actionRows.length = 0;
  savedReadings.length = 0;
  fakeIo.emitted.length = 0;
  thresholdByVariable = new Map();
  alerts.clear();
  nextAlertId = 1;
  deviceContext = { activo: true, cliente_id: 10, reclamado_en: null };
}

test('CP-RF09 registra una alerta con valor y umbrales de origen', async () => {
  reset();

  const result = await alertasService.registrar({
    dispositivoCodigo: 'DEV-A',
    variable: 'temperatura',
    valor: 31,
    umbralMin: 10,
    umbralMax: 30,
  });

  assert.equal(result.alerta.valor, 31);
  assert.equal(result.alerta.umbral_min, 10);
  assert.equal(result.alerta.umbral_max, 30);
  assert.equal(result.alerta.cliente_id, 10);
  assert.equal(actionRows.length, 1);
});

test('CP-RF09 no registra alertas para un dispositivo sin cliente', async () => {
  reset();
  deviceContext.cliente_id = null;

  const result = await alertasService.registrar({
    dispositivoCodigo: 'DEV-UNASSIGNED',
    variable: 'temperatura',
    valor: 31,
    umbralMin: 10,
    umbralMax: 30,
  });

    assert.equal(result, null);
    assert.ok(queries.some(({ sql }) => sql === 'ROLLBACK'));
    assert.equal(actionRows.length, 0);
  });

  test('CP-RF09 no alerta cuando el valor es igual al mínimo o máximo', async () => {
    reset();
    thresholdByVariable.set('temperatura', {
      umbral_min: 10,
      umbral_max: 30,
      notificaciones_activas: true,
    });

    for (const valor of [10, 30]) {
      await procesarMensaje(
        fakeIo,
        'ecotrack/DEV-A/lecturas',
        Buffer.from(JSON.stringify({ temperatura: valor, humedad: 50, luminosidad: 50 })),
        new Date('2026-01-01T12:00:00.000Z')
      );
    }

    assert.equal(alerts.size, 0);
    assert.equal(fakeIo.emitted.filter(({ event }) => event === 'alerta').length, 0);
  });

  test('CP-RF09 alerta apenas debajo del mínimo y apenas sobre el máximo', async () => {
    reset();
    thresholdByVariable.set('temperatura', {
      umbral_min: 10,
      umbral_max: 30,
      notificaciones_activas: true,
    });

    for (const valor of [9.99, 30.01]) {
      await procesarMensaje(
        fakeIo,
        'ecotrack/DEV-A/lecturas',
        Buffer.from(JSON.stringify({ temperatura: valor, humedad: 50, luminosidad: 50 })),
        new Date('2026-01-01T12:00:00.000Z')
      );
    }

    assert.equal(alerts.size, 2);
    assert.deepEqual([...alerts.values()].map(({ valor, umbral_min, umbral_max }) => ({
      valor,
      umbral_min,
      umbral_max,
    })), [
      { valor: 9.99, umbral_min: 10, umbral_max: 30 },
      { valor: 30.01, umbral_min: 10, umbral_max: 30 },
    ]);
  });

  test('CP-RF09 no alerta sin umbral o con notificaciones desactivadas', async () => {
    reset();
    await procesarMensaje(
      fakeIo,
      'ecotrack/DEV-A/lecturas',
      Buffer.from(JSON.stringify({ temperatura: 31, humedad: 50, luminosidad: 50 })),
      new Date('2026-01-01T12:00:00.000Z')
    );
    thresholdByVariable.set('temperatura', {
      umbral_min: 10,
      umbral_max: 30,
      notificaciones_activas: false,
    });
    await procesarMensaje(
      fakeIo,
      'ecotrack/DEV-A/lecturas',
      Buffer.from(JSON.stringify({ temperatura: 31, humedad: 50, luminosidad: 50 })),
      new Date('2026-01-01T12:00:00.000Z')
    );

    assert.equal(alerts.size, 0);
    assert.equal(fakeIo.emitted.filter(({ event }) => event === 'alerta').length, 0);
  });

  test('CP-RF09 genera una alerta por cada variable fuera de rango', async () => {
    reset();
    for (const variable of ['temperatura', 'humedad', 'luminosidad']) {
      thresholdByVariable.set(variable, {
        umbral_min: 10,
        umbral_max: 30,
        notificaciones_activas: true,
      });
    }

    await procesarMensaje(
      fakeIo,
      'ecotrack/DEV-A/lecturas',
      Buffer.from(JSON.stringify({ temperatura: 31, humedad: 9, luminosidad: 31 })),
      new Date('2026-01-01T12:00:00.000Z')
    );

    assert.equal(alerts.size, 3);
    assert.deepEqual([...alerts.values()].map(({ variable }) => variable).sort(), [
      'humedad',
      'luminosidad',
      'temperatura',
    ]);
  });

test('CP-RF11 cambia pendiente a atendida y vuelve a pendiente con comentario', async () => {
  reset();
  const created = await alertasService.registrar({
    dispositivoCodigo: 'DEV-A',
    variable: 'humedad',
    valor: 90,
    umbralMin: 10,
    umbralMax: 80,
  });

  const attended = await alertasService.actualizarEstado({
    id: created.alerta.id,
    estado: 'atendida',
    clienteId: 10,
    comentario: 'Revisada por operador',
    usuarioId: 4,
    usuarioUsername: 'operador-a',
  });
  assert.equal(attended.auditoria.estadoAnterior, 'pendiente');
  assert.equal(attended.auditoria.estadoNuevo, 'atendida');
  assert.equal(attended.alerta.comentario, 'Revisada por operador');

  const reopened = await alertasService.actualizarEstado({
    id: created.alerta.id,
    estado: 'pendiente',
    clienteId: 10,
    comentario: 'Se requiere otra revisión',
    usuarioId: 4,
    usuarioUsername: 'operador-a',
  });
  assert.equal(reopened.auditoria.estadoAnterior, 'atendida');
  assert.equal(reopened.auditoria.estadoNuevo, 'pendiente');
  assert.equal(reopened.alerta.comentario, 'Se requiere otra revisión');
});

test('CP-RF11 devuelve null para alerta inexistente o de otro cliente', async () => {
  reset();
  const created = await alertasService.registrar({
    dispositivoCodigo: 'DEV-A',
    variable: 'temperatura',
    valor: 0,
    umbralMin: 10,
    umbralMax: 30,
  });

  assert.equal(await alertasService.actualizarEstado({
    id: 999,
    estado: 'atendida',
    clienteId: 10,
    comentario: 'No existe',
  }), null);
  assert.equal(await alertasService.actualizarEstado({
    id: created.alerta.id,
    estado: 'atendida',
    clienteId: 20,
    comentario: 'Cliente equivocado',
  }), null);
});

test('CP-RF11 lista alertas con filtros y paginación por cliente', async () => {
  reset();
  const result = await alertasService.listar({
    dispositivo: 'DEV-A',
    estado: 'pendiente',
    variable: 'temperatura',
    pagina: 2,
    limite: 5,
    fechaDesde: '2026-01-01',
    fechaHasta: '2026-01-31',
    clienteId: 10,
  });

  assert.equal(result.pagina, 2);
  assert.equal(result.limite, 5);
  assert.equal(result.totalPaginas, 1);
  const listQueries = queries.filter(({ sql }) => sql.includes('a.cliente_id = $1'));
  assert.equal(listQueries.length, 2);
  assert.deepEqual(listQueries[0].params, [10, 'DEV-A', 'pendiente', 'temperatura', '2026-01-01', '2026-01-31']);
  assert.deepEqual(listQueries[1].params.slice(0, 6), listQueries[0].params);
});

test('CP-RF11 obtiene distribución por variable y restringe por cliente/dispositivo', async () => {
  reset();
  const result = await alertasService.distribucionPorVariable({
    dispositivo: 'DEV-A',
    clienteId: 10,
  });

  assert.deepEqual(result, [{ variable: 'temperatura', cantidad: '2' }]);
  const query = queries[0];
  assert.match(query.sql, /a\.cliente_id = \$1/);
  assert.match(query.sql, /a\.dispositivo_codigo = \$2/);
  assert.deepEqual(query.params, [10, 'DEV-A']);
});

test.todo('CP-RF09 define si alertas repetidas consecutivas deben consolidarse o registrarse individualmente');
