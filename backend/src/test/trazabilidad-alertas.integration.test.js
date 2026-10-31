const assert = require('assert');
const test = require('node:test');
const { once } = require('events');
const { io } = require('socket.io-client');
const { createRealtimeFixture } = require('./realtime.test-support');

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL es obligatorio para ejecutar trazabilidad-alertas.integration.test.js');
}

let fixture;
let baseUrl;
let alertasService;
let alertaAccionesService;
let dbPool;

test.before(async () => {
  fixture = await createRealtimeFixture();
  alertasService = require('../services/alertas.service');
  alertaAccionesService = require('../services/alerta-acciones.service');
  dbPool = require('../config/db');
  baseUrl = `http://127.0.0.1:${fixture.server.address().port}`;
});

test.after(async () => {
  await fixture.close();
});

async function seedThreshold(deviceCode) {
  await fixture.pool.query(
    `INSERT INTO umbrales
      (dispositivo_codigo, variable, umbral_min, umbral_max, notificaciones_activas)
     VALUES ($1, 'temperatura', 0, 20, true)
     ON CONFLICT (dispositivo_codigo, variable)
     DO UPDATE SET umbral_min = 0, umbral_max = 20, notificaciones_activas = true`,
    [deviceCode]
  );
}

function reading(temperature = 23.4) {
  return JSON.stringify({ temperatura: temperature, humedad: 47, luminosidad: 65 });
}

function connect(user) {
  return io(baseUrl, {
    auth: { token: fixture.signToken(user) },
    reconnection: false,
  });
}

test('US1: generación crea la alerta y su acción sistema en la misma operación', async () => {
  await seedThreshold(fixture.seed.devices.a);
  const socket = connect(fixture.seed.users.a);
  const actionPromise = once(socket, 'alerta-accion');

  try {
    await once(socket, 'connect');
    await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
    const [action] = await actionPromise;
    const { rows } = await fixture.pool.query(
      `SELECT a.id AS alerta_id, a.cliente_id, aa.accion, aa.usuario_id,
              aa.usuario_username, aa.timestamp
       FROM alertas a
       JOIN alerta_acciones aa ON aa.alerta_id = a.id
       WHERE a.dispositivo_codigo = $1
       ORDER BY a.id DESC
       LIMIT 1`,
      [fixture.seed.devices.a]
    );

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].cliente_id, fixture.seed.clients.a.id);
    assert.strictEqual(rows[0].accion, 'generar_alerta');
    assert.strictEqual(rows[0].usuario_id, null);
    assert.strictEqual(rows[0].usuario_username, 'sistema');
    assert.strictEqual(action.alerta_id, rows[0].alerta_id);
    assert.strictEqual(action.cliente_id, fixture.seed.clients.a.id);
  } finally {
    socket.close();
  }
});

test('US1: cada cambio de estado registra actor y detalle sin sobrescribir acciones', async () => {
  await seedThreshold(fixture.seed.devices.a);
  await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
  const { rows: alertas } = await fixture.pool.query(
    'SELECT id FROM alertas WHERE dispositivo_codigo = $1 ORDER BY id DESC LIMIT 1',
    [fixture.seed.devices.a]
  );
  const alertaId = alertas[0].id;
  const authorization = fixture.signToken(fixture.seed.users.a);

  for (const [estado, comentario] of [
    ['atendida', 'Se ajustó la ventilación'],
    ['pendiente', 'Se requiere una nueva revisión'],
  ]) {
    const response = await fetch(`${baseUrl}/api/alertas/${alertaId}`, {
      method: 'PATCH',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado, comentario }),
    });
    assert.strictEqual(response.status, 200);
  }

  const { rows: acciones } = await fixture.pool.query(
    `SELECT accion, usuario_id, usuario_username, detalle
     FROM alerta_acciones
     WHERE alerta_id = $1
     ORDER BY timestamp ASC, id ASC`,
    [alertaId]
  );
  assert.deepStrictEqual(acciones.map((accion) => accion.accion), [
    'generar_alerta',
    'marcar_atendida',
    'reabrir_alerta',
  ]);
  assert.strictEqual(acciones[1].usuario_id, fixture.seed.users.a.id);
  assert.strictEqual(acciones[1].usuario_username, fixture.seed.users.a.username);
  assert.strictEqual(acciones[1].detalle, 'Se ajustó la ventilación');
  assert.strictEqual(acciones[2].detalle, 'Se requiere una nueva revisión');

  const { rows: auditRows } = await fixture.pool.query(
    `SELECT accion, entidad, entidad_id, usuario_username, detalle
     FROM auditoria
     WHERE entidad = 'alerta' AND entidad_id = $1
     ORDER BY id ASC`,
    [String(alertaId)]
  );
  assert.deepStrictEqual(auditRows.map((row) => row.accion), [
    'cambiar_estado_alerta',
    'cambiar_estado_alerta',
  ]);
  assert.ok(auditRows[0].detalle.includes('Estado anterior: pendiente'));
  assert.ok(auditRows[1].detalle.includes('Estado anterior: atendida'));
});

test('US1: el fallo de la acción revierte el cambio de estado', async () => {
  await seedThreshold(fixture.seed.devices.a);
  await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
  const { rows: alertas } = await fixture.pool.query(
    'SELECT id, estado FROM alertas WHERE dispositivo_codigo = $1 ORDER BY id DESC LIMIT 1',
    [fixture.seed.devices.a]
  );
  const alerta = alertas[0];
  const originalInsertar = alertaAccionesService.insertar;
  alertaAccionesService.insertar = async () => {
    throw new Error('fallo simulado al registrar acción');
  };
  try {
    await assert.rejects(
      alertasService.actualizarEstado({
        id: alerta.id,
        estado: 'atendida',
        clienteId: fixture.seed.clients.a.id,
        comentario: 'no debe persistir',
        usuarioId: fixture.seed.users.a.id,
        usuarioUsername: fixture.seed.users.a.username,
      }),
      /fallo simulado/
    );
  } finally {
    alertaAccionesService.insertar = originalInsertar;
  }

  const { rows: current } = await fixture.pool.query('SELECT estado FROM alertas WHERE id = $1', [alerta.id]);
  const { rows: actions } = await fixture.pool.query(
    'SELECT COUNT(*) FROM alerta_acciones WHERE alerta_id = $1',
    [alerta.id]
  );
  assert.strictEqual(current[0].estado, alerta.estado);
  assert.strictEqual(Number(actions[0].count), 1);
});

test('US1: el fallo de auditoría no revierte el cambio confirmado', async () => {
  await seedThreshold(fixture.seed.devices.a);
  await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
  const { rows } = await fixture.pool.query(
    'SELECT id FROM alertas WHERE dispositivo_codigo = $1 ORDER BY id DESC LIMIT 1',
    [fixture.seed.devices.a]
  );
  const alertaId = rows[0].id;
  const originalQuery = dbPool.query.bind(dbPool);
  dbPool.query = async (text, values) => {
    if (String(text).includes('INSERT INTO auditoria')) {
      throw new Error('fallo simulado de auditoría');
    }
    return originalQuery(text, values);
  };

  try {
    const response = await fetch(`${baseUrl}/api/alertas/${alertaId}`, {
      method: 'PATCH',
      headers: {
        Authorization: fixture.signToken(fixture.seed.users.a),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ estado: 'atendida', comentario: 'Auditoría caída' }),
    });
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.id, alertaId);
    assert.strictEqual(body.estado, 'atendida');
  } finally {
    dbPool.query = originalQuery;
  }

  const { rows: persisted } = await fixture.pool.query(
    `SELECT a.estado, aa.accion, aa.detalle
     FROM alertas a
     JOIN alerta_acciones aa ON aa.alerta_id = a.id
     WHERE a.id = $1 AND aa.accion = 'marcar_atendida'`,
    [alertaId]
  );
  assert.strictEqual(persisted[0].estado, 'atendida');
  assert.strictEqual(persisted[0].detalle, 'Auditoría caída');
});

test('US1: una transición idempotente no crea acción ni auditoría', async () => {
  await seedThreshold(fixture.seed.devices.a);
  await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
  const { rows } = await fixture.pool.query(
    'SELECT id FROM alertas WHERE dispositivo_codigo = $1 ORDER BY id DESC LIMIT 1',
    [fixture.seed.devices.a]
  );
  const alertaId = rows[0].id;
  const response = await fetch(`${baseUrl}/api/alertas/${alertaId}`, {
    method: 'PATCH',
    headers: {
      Authorization: fixture.signToken(fixture.seed.users.a),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ estado: 'pendiente', comentario: 'Sin cambio' }),
  });
  assert.strictEqual(response.status, 200);
  const { rows: actions } = await fixture.pool.query(
    'SELECT accion FROM alerta_acciones WHERE alerta_id = $1 ORDER BY id',
    [alertaId]
  );
  const { rows: audits } = await fixture.pool.query(
    `SELECT id FROM auditoria
     WHERE entidad = 'alerta' AND entidad_id = $1 AND accion = 'cambiar_estado_alerta'`,
    [String(alertaId)]
  );
  assert.deepStrictEqual(actions.map((action) => action.accion), ['generar_alerta']);
  assert.strictEqual(audits.length, 0);
});

test('US1: atender sin comentario responde 400 y no registra nada', async () => {
  await seedThreshold(fixture.seed.devices.a);
  await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
  const { rows } = await fixture.pool.query(
    'SELECT id FROM alertas WHERE dispositivo_codigo = $1 ORDER BY id DESC LIMIT 1',
    [fixture.seed.devices.a]
  );
  const alertaId = rows[0].id;
  const response = await fetch(`${baseUrl}/api/alertas/${alertaId}`, {
    method: 'PATCH',
    headers: {
      Authorization: fixture.signToken(fixture.seed.users.a),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ estado: 'atendida' }),
  });
  assert.strictEqual(response.status, 400);
  const { rows: actions } = await fixture.pool.query(
    'SELECT accion FROM alerta_acciones WHERE alerta_id = $1',
    [alertaId]
  );
  const { rows: audits } = await fixture.pool.query(
    `SELECT id FROM auditoria
     WHERE entidad = 'alerta' AND entidad_id = $1 AND accion = 'cambiar_estado_alerta'`,
    [String(alertaId)]
  );
  assert.deepStrictEqual(actions.map((action) => action.accion), ['generar_alerta']);
  assert.strictEqual(audits.length, 0);
});

test('US1: reabrir sin comentario responde 400', async () => {
  await seedThreshold(fixture.seed.devices.a);
  await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
  const { rows } = await fixture.pool.query(
    'SELECT id FROM alertas WHERE dispositivo_codigo = $1 ORDER BY id DESC LIMIT 1',
    [fixture.seed.devices.a]
  );
  const alertaId = rows[0].id;
  const authorization = fixture.signToken(fixture.seed.users.a);
  const atendida = await fetch(`${baseUrl}/api/alertas/${alertaId}`, {
    method: 'PATCH',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado: 'atendida', comentario: 'Atención inicial' }),
  });
  assert.strictEqual(atendida.status, 200);

  const reabierta = await fetch(`${baseUrl}/api/alertas/${alertaId}`, {
    method: 'PATCH',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado: 'pendiente' }),
  });
  assert.strictEqual(reabierta.status, 400);
});

test('US1: comentario de 501 caracteres responde 400', async () => {
  await seedThreshold(fixture.seed.devices.a);
  await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
  const { rows } = await fixture.pool.query(
    'SELECT id FROM alertas WHERE dispositivo_codigo = $1 ORDER BY id DESC LIMIT 1',
    [fixture.seed.devices.a]
  );
  const response = await fetch(`${baseUrl}/api/alertas/${rows[0].id}`, {
    method: 'PATCH',
    headers: {
      Authorization: fixture.signToken(fixture.seed.users.a),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ estado: 'atendida', comentario: 'A'.repeat(501) }),
  });
  assert.strictEqual(response.status, 400);
});

test('US2: el historial se consulta ordenado y no revela alertas de otro cliente', async () => {
  await seedThreshold(fixture.seed.devices.a);
  await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
  const { rows } = await fixture.pool.query(
    'SELECT id FROM alertas WHERE dispositivo_codigo = $1 ORDER BY id DESC LIMIT 1',
    [fixture.seed.devices.a]
  );
  const alertaId = rows[0].id;

  const atendida = await fetch(`${baseUrl}/api/alertas/${alertaId}`, {
    method: 'PATCH',
    headers: {
      Authorization: fixture.signToken(fixture.seed.users.a),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ estado: 'atendida', comentario: 'Historial de prueba' }),
  });
  assert.strictEqual(atendida.status, 200);

  const response = await fetch(`${baseUrl}/api/alertas/${alertaId}/acciones`, {
    headers: { Authorization: fixture.signToken(fixture.seed.users.a) },
  });
  assert.strictEqual(response.status, 200);
  const history = await response.json();
  assert.deepStrictEqual(history.data.map((action) => action.accion), [
    'generar_alerta',
    'marcar_atendida',
  ]);
  assert.ok(new Date(history.data[0].timestamp) <= new Date(history.data[1].timestamp));

  const otherClient = await fetch(`${baseUrl}/api/alertas/${alertaId}/acciones`, {
    headers: { Authorization: fixture.signToken(fixture.seed.users.b) },
  });
  assert.strictEqual(otherClient.status, 404);
});

test('US2: el cliente histórico conserva el historial después de transferir el dispositivo', async () => {
  await seedThreshold(fixture.seed.devices.a);
  await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
  const { rows } = await fixture.pool.query(
    'SELECT id FROM alertas WHERE dispositivo_codigo = $1 ORDER BY id DESC LIMIT 1',
    [fixture.seed.devices.a]
  );
  const alertaId = rows[0].id;

  await fixture.pool.query(
    'UPDATE dispositivos SET cliente_id = $1 WHERE codigo = $2',
    [fixture.seed.clients.b.id, fixture.seed.devices.a]
  );

  const originalClient = await fetch(`${baseUrl}/api/alertas/${alertaId}/acciones`, {
    headers: { Authorization: fixture.signToken(fixture.seed.users.a) },
  });
  const newClient = await fetch(`${baseUrl}/api/alertas/${alertaId}/acciones`, {
    headers: { Authorization: fixture.signToken(fixture.seed.users.b) },
  });
  assert.strictEqual(originalClient.status, 200);
  assert.strictEqual((await originalClient.json()).data.length, 1);
  assert.strictEqual(newClient.status, 404);
});

test('US2: una alerta antigua sin acciones devuelve un historial vacío', async () => {
  const { rows } = await fixture.pool.query(
    `INSERT INTO alertas
      (dispositivo_codigo, variable, valor, umbral_min, umbral_max, estado, cliente_id)
     VALUES ($1, 'humedad', 80, 0, 60, 'pendiente', $2)
     RETURNING id`,
    [fixture.seed.devices.a, fixture.seed.clients.a.id]
  );
  const response = await fetch(`${baseUrl}/api/alertas/${rows[0].id}/historial`, {
    headers: { Authorization: fixture.signToken(fixture.seed.users.a) },
  });
  assert.strictEqual(response.status, 200);
  const history = await response.json();
  assert.strictEqual(history.data.length, 1);
  assert.strictEqual(history.data[0].accion, 'generar_alerta');
  assert.strictEqual(history.data[0].cliente_id, fixture.seed.clients.a.id);
  assert.strictEqual(new Date(history.data[0].timestamp).toISOString(),
    (await fixture.pool.query('SELECT timestamp FROM alertas WHERE id = $1', [rows[0].id])).rows[0].timestamp.toISOString());
});

test('US3: Registro de actividad combina auditoría y acciones con filtros y aislamiento', async () => {
  await seedThreshold(fixture.seed.devices.a);
  await fixture.procesarMensaje(`ecotrack/${fixture.seed.devices.a}/lecturas`, reading());
  const { rows } = await fixture.pool.query(
    'SELECT id FROM alertas WHERE dispositivo_codigo = $1 ORDER BY id DESC LIMIT 1',
    [fixture.seed.devices.a]
  );
  const alertaId = rows[0].id;
  await fixture.pool.query(
    `INSERT INTO auditoria
      (cliente_id, usuario_id, usuario_username, accion, entidad, entidad_id, detalle)
     VALUES ($1, $2, $3, 'crear_dispositivo', 'dispositivo', $4, 'Actividad existente')`,
    [
      fixture.seed.clients.a.id,
      fixture.seed.users.a.id,
      fixture.seed.users.a.username,
      fixture.seed.devices.a,
    ]
  );

  const authorization = fixture.signToken(fixture.seed.users.a);
  const actividadResponse = await fetch(`${baseUrl}/api/auditoria?pagina=1&limite=10`, {
    headers: { Authorization: authorization },
  });
  assert.strictEqual(actividadResponse.status, 200);
  const actividad = await actividadResponse.json();
  assert.ok(actividad.data.some((row) => row.entidad === 'alerta' && row.entidad_id === String(alertaId)));
  assert.ok(actividad.data.some((row) => row.entidad === 'alerta' && row.origen === 'alerta_acciones'));
  assert.strictEqual(
    actividad.data.filter((row) => row.entidad === 'alerta' && row.entidad_id === String(alertaId)
      && row.accion === 'cambiar_estado_alerta').length,
    0
  );
  assert.ok(actividad.data.some((row) => row.entidad === 'dispositivo'));
  assert.ok(actividad.total >= 2);
  for (let index = 1; index < actividad.data.length; index += 1) {
    assert.ok(new Date(actividad.data[index - 1].timestamp) >= new Date(actividad.data[index].timestamp));
  }

  const paginaResponse = await fetch(`${baseUrl}/api/auditoria?pagina=1&limite=1`, {
    headers: { Authorization: authorization },
  });
  const pagina = await paginaResponse.json();
  assert.strictEqual(paginaResponse.status, 200);
  assert.strictEqual(pagina.data.length, 1);
  assert.strictEqual(pagina.limite, 1);
  assert.ok(pagina.totalPaginas >= 2);

  const soloAlertasResponse = await fetch(
    `${baseUrl}/api/auditoria?entidad=alerta&accion=generar_alerta&pagina=1&limite=1`,
    { headers: { Authorization: authorization } }
  );
  const soloAlertas = await soloAlertasResponse.json();
  assert.strictEqual(soloAlertasResponse.status, 200);
  assert.ok(soloAlertas.total >= 1);
  assert.ok(soloAlertas.data.some((row) => row.entidad_id === String(alertaId)));

  const soloCambiosResponse = await fetch(
    `${baseUrl}/api/auditoria?accion=cambiar_estado_alerta`,
    { headers: { Authorization: authorization } }
  );
  const soloCambios = await soloCambiosResponse.json();
  assert.strictEqual(soloCambiosResponse.status, 200);
  assert.strictEqual(soloCambios.total, 0);

  const otroClienteResponse = await fetch(`${baseUrl}/api/auditoria?pagina=1&limite=10`, {
    headers: { Authorization: fixture.signToken(fixture.seed.users.b) },
  });
  const otroCliente = await otroClienteResponse.json();
  assert.strictEqual(otroClienteResponse.status, 200);
  assert.strictEqual(otroCliente.data.some((row) => row.entidad_id === String(alertaId)), false);
});

test('US3: Registro de actividad mantiene autorización admin', async () => {
  const commonUser = {
    id: fixture.seed.users.a.id,
    username: fixture.seed.users.a.username,
    cliente_id: fixture.seed.users.a.cliente_id,
    token_version: fixture.seed.users.a.token_version,
  };
  const response = await fetch(`${baseUrl}/api/auditoria`, {
    headers: {
      Authorization: require('jsonwebtoken').sign(
        {
          sub: commonUser.id,
          username: commonUser.username,
          rol: 'comun',
          clienteId: commonUser.cliente_id,
          tv: commonUser.token_version,
        },
        process.env.JWT_SECRET
      ),
    },
  });
  assert.strictEqual(response.status, 403);
});
