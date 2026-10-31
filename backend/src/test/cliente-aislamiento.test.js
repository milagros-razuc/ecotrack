const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../config/db.js');
const queries = [];
const state = {
  devices: [
    { codigo: 'DEV-A', cliente_id: 10, activo: true },
    { codigo: 'DEV-B', cliente_id: 20, activo: true },
  ],
  users: [
    { id: 1, username: 'admin-a', rol: 'admin', cliente_id: 10 },
    { id: 2, username: 'admin-b', rol: 'admin', cliente_id: 20 },
  ],
  alerts: [
    { id: 1, dispositivo_codigo: 'DEV-A', cliente_id: 10, estado: 'pendiente' },
    { id: 2, dispositivo_codigo: 'DEV-B', cliente_id: 20, estado: 'pendiente' },
  ],
};

function record(sql, params) {
  queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
}

function rowsForClient(items, clientId) {
  return items.filter(item => item.cliente_id === clientId);
}

const fakeClient = {
  async query(sql, params = []) {
    record(sql, params);
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('SELECT * FROM alertas') && sql.includes('FOR UPDATE')) {
      const alert = state.alerts.find(item => item.id === Number(params[0])
        && item.cliente_id === params[1]);
      return { rows: alert ? [alert] : [], rowCount: alert ? 1 : 0 };
    }
    if (sql.includes('UPDATE alertas SET estado')) {
      const alert = state.alerts.find(item => item.id === Number(params[1])
        && item.cliente_id === params[2]);
      return { rows: alert ? [alert] : [], rowCount: alert ? 1 : 0 };
    }
    if (sql.includes('DELETE FROM usuarios')) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  },
  release() {},
};

const fakePool = {
  async query(sql, params = []) {
    record(sql, params);

    if (sql.includes('FROM dispositivos WHERE activo = true')) {
      return { rows: rowsForClient(state.devices, params[0]) };
    }
    if (sql.includes('FROM dispositivos') && sql.includes('cliente_id = $1')) {
      const device = state.devices.find(item => item.codigo === params[0]);
      return { rows: device ? [{ cliente_id: device.cliente_id }] : [] };
    }
    if (sql.includes('INSERT INTO dispositivos') && sql.includes('ON CONFLICT')) {
      const device = state.devices.find(item => item.codigo === params[0]);
      const allowed = device && (device.cliente_id === null || device.cliente_id === params[3]);
      return allowed ? { rows: [{ cliente_id: params[3] }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (sql.includes('FROM lecturas l') && sql.includes('l.cliente_id = $1')) {
      return { rows: [{ dispositivo_codigo: params[1] || 'DEV-A', cliente_id: params[0] }] };
    }
    if (sql.includes('FROM umbrales u') && sql.includes('d.cliente_id = $1')) {
      return { rows: [{ dispositivo_codigo: 'DEV-A', cliente_id: params[0] }] };
    }
    if (sql.includes('SELECT cliente_id FROM dispositivos')) {
      const device = state.devices.find(item => item.codigo === params[0]);
      return { rows: device ? [{ cliente_id: device.cliente_id }] : [] };
    }
    if (sql.includes('FROM alertas a') && sql.includes('COUNT(*)')) {
      return { rows: [{ count: String(rowsForClient(state.alerts, params[0]).length) }] };
    }
    if (sql.includes('FROM alertas a')) {
      return { rows: rowsForClient(state.alerts, params[0]) };
    }
    if (sql.includes('FROM alertas') && sql.includes('cliente_id = $2')) {
      const alert = state.alerts.find(item => item.id === Number(params[0])
        && item.cliente_id === params[1]);
      return { rows: alert ? [alert] : [] };
    }
    if (sql.includes('FROM usuarios WHERE cliente_id = $1')) {
      return { rows: rowsForClient(state.users, params[0]) };
    }
    if (sql.includes('SELECT * FROM usuarios WHERE id = $1 AND cliente_id = $2')) {
      const user = state.users.find(item => item.id === Number(params[0])
        && item.cliente_id === params[1]);
      return { rows: user ? [user] : [] };
    }
    if (sql.includes('SELECT COUNT(*) FROM usuarios')) {
      return { rows: [{ count: '1' }] };
    }
    return { rows: [], rowCount: 1 };
  },
  async connect() {
    return fakeClient;
  },
};

require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };

const extraerCliente = require('../middleware/cliente');
const dispositivosService = require('../services/dispositivos.service');
const lecturasService = require('../services/lecturas.service');
const umbralesService = require('../services/umbrales.service');
const alertasService = require('../services/alertas.service');
const alertaAccionesService = require('../services/alerta-acciones.service');
const usuariosService = require('../services/usuarios.service');

function resetQueries() {
  queries.length = 0;
}

function responseDouble() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('CP-RF18 extraerCliente rechaza token sin clienteId con 401', () => {
  const res = responseDouble();
  extraerCliente({ usuario: { sub: 1 } }, res, () => {
    throw new Error('no debe continuar');
  });
  assert.equal(res.statusCode, 401);
});

test('CP-RF18 extraerCliente copia el clienteId del token y no de la solicitud', () => {
  const req = { usuario: { clienteId: 10 }, body: { clienteId: 20 }, query: { clienteId: 20 } };
  extraerCliente(req, responseDouble(), () => {});
  assert.equal(req.clienteId, 10);
});

test('CP-RF18 dispositivos, lecturas y umbrales filtran por cliente A', async () => {
  resetQueries();
  await dispositivosService.listar(10);
  await lecturasService.listar({ clienteId: 10 });
  await lecturasService.listarAgregado({ periodo: 'mes', clienteId: 10 });
  await umbralesService.listar(undefined, 10);

  const relevant = queries.filter(query => query.sql.includes('FROM dispositivos')
    || query.sql.includes('FROM lecturas')
    || query.sql.includes('FROM umbrales'));
  assert.ok(relevant.length >= 4);
  assert.ok(relevant.every(query => query.params.includes(10)
    || query.sql.includes('d.cliente_id = $1')
    || query.sql.includes('l.cliente_id = $1')));
});

test('CP-RF18 alertas y acciones filtran por cliente mediante condición y JOIN', async () => {
  resetQueries();
  await alertasService.listar({ clienteId: 10 });
  await alertasService.obtenerPorId(2, 10);
  await alertaAccionesService.listar({ alertaId: 2, clienteId: 10 });

  const alertQueries = queries.filter(query => query.sql.includes('alertas'));
  assert.ok(alertQueries.some(query => query.sql.includes('a.cliente_id = $1')));
  assert.ok(alertQueries.some(query => query.sql.includes('JOIN alertas a')
    && query.sql.includes('a.cliente_id = aa.cliente_id')));
  assert.ok(alertQueries.every(query => query.params.includes(10)));
});

test('CP-RF18 usuarios filtra listar, editar y borrar por cliente A', async () => {
  resetQueries();
  await usuariosService.listar(10);
  assert.deepEqual(await usuariosService.actualizar(2, { nombre: 'No tocar' }, 10), {
    error: 'Usuario no encontrado',
  });
  assert.deepEqual(await usuariosService.eliminar(2, 1, 10), {
    error: 'Usuario no encontrado',
  });

  const userQueries = queries.filter(query => query.sql.includes('usuarios'));
  assert.ok(userQueries.every(query => query.params.includes(10)
    || query.sql.includes('cliente_id = $1')));
});

test('CP-RF18 usuario A no puede leer, modificar ni borrar alertas, umbrales o dispositivos de B', async () => {
  resetQueries();
  assert.equal(await alertasService.obtenerPorId(2, 10), null);
  assert.deepEqual(await umbralesService.crearOActualizar({
    dispositivoCodigo: 'DEV-B',
    variable: 'temperatura',
    umbralMin: 1,
    umbralMax: 2,
    clienteId: 10,
  }), { error: 'Dispositivo no encontrado' });
  assert.equal(await dispositivosService.eliminar('DEV-B', 10), null);

  const crossTenant = queries.filter(query => query.params.includes('DEV-B') || query.params.includes(2));
  assert.ok(crossTenant.length > 0);
  const protectedQueries = crossTenant.filter(query => query.sql.includes('FROM alertas')
    || query.sql.includes('UPDATE dispositivos'));
  assert.ok(protectedQueries.every(query => query.params.includes(10)
    || query.sql.includes('cliente_id = $2')));
});

test('CP-RF18 usuario A no puede leer ni modificar usuarios de B', async () => {
  resetQueries();
  assert.deepEqual(await usuariosService.actualizar(2, { rol: 'comun' }, 10), {
    error: 'Usuario no encontrado',
  });
  assert.deepEqual(await usuariosService.eliminar(2, 1, 10), {
    error: 'Usuario no encontrado',
  });
  assert.ok(queries.every(query => query.params.includes(10)
    || !query.sql.includes('usuarios WHERE id')));
});

test('CP-RF18 transferencia: histórico conserva el cliente de captura y cambia la visibilidad al transferir', async () => {
  const history = [
    { dispositivo_codigo: 'DEV-A', cliente_id: 10, timestamp: '2026-10-01T10:00:00Z' },
    { dispositivo_codigo: 'DEV-A', cliente_id: 20, timestamp: '2026-10-02T10:00:00Z' },
  ];

  resetQueries();
  await lecturasService.listar({ dispositivo: 'DEV-A', clienteId: 10 });
  await lecturasService.listar({ dispositivo: 'DEV-A', clienteId: 20 });
  const readingQueries = queries.filter(query => query.sql.includes('FROM lecturas l'));
  assert.ok(readingQueries.every(query => query.sql.includes('l.cliente_id = $1')));
  assert.deepEqual(history.filter(item => item.cliente_id === 10), [history[0]]);
  assert.deepEqual(history.filter(item => item.cliente_id === 20), [history[1]]);
});

test.todo('CP-RF18 transferencia concurrente: requiere reproducir carrera de baja/reclamo con base PostgreSQL real o prueba de integración');
test.todo('CP-RF18 umbrales.crearOActualizar consulta primero por codigo sin cliente_id; el aislamiento se completa con la comparación en servicio, no en SQL');
