const assert = require('node:assert/strict');
const test = require('node:test');
const { renderDeviceRow, renderSummaryItem } = require('./platform-panel-render');

test('renderDeviceRow muestra conexión textual y las dos fechas requeridas', () => {
  const html = renderDeviceRow({
    codigo: 'D-001',
    cliente: 'Cliente',
    estado: 'enrolado',
    firmware_version: '1.0',
    online: 'offline',
    ultima_lectura: { timestamp: '2026-11-08T12:00:00.000Z' },
    ultima_conexion: '2026-11-08T11:00:00.000Z',
  });

  assert.match(html, />offline</);
  assert.match(html, /0?8\/0?11\/2026/);
  assert.match(html, /sin lectura reciente|0?8\/0?11\/2026/);

  const withoutDates = renderDeviceRow({ codigo: 'D-002', online: 'online' });
  assert.match(withoutDates, />sin lectura reciente \(últimos 30 días\)</);
  assert.match(withoutDates, />—</);
});

test('renderSummaryItem mantiene el resumen escapado', () => {
  assert.match(renderSummaryItem('<script>', '<img>'), /&lt;script&gt;.*&lt;img&gt;/);
});

test('plataforma define los encabezados de las siete columnas', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const page = fs.readFileSync(path.join(__dirname, '..', 'plataforma.html'), 'utf8');

  for (const header of ['Código', 'Cliente', 'Estado', 'Firmware', 'Conexión', 'Última lectura', 'Última conexión']) {
    assert.match(page, new RegExp(`<th[^>]*>${header}</th>`));
  }
});

test('el panel muestra reset solo para admin y comun, nunca para platform_admin ni el actor', () => {
  const { puedeResetearUsuario, renderUserRow } = require('./platform-panel-render');
  assert.equal(puedeResetearUsuario({ id: 2, username: 'admin', rol: 'admin' }, 'platform'), true);
  assert.equal(puedeResetearUsuario({ id: 3, username: 'comun', rol: 'comun' }, 'platform'), true);
  assert.equal(puedeResetearUsuario({ id: 4, username: 'platform-target', rol: 'platform_admin' }, 'platform'), false);
  assert.equal(puedeResetearUsuario({ id: 1, username: 'platform', rol: 'platform_admin' }, 'platform'), false);
  assert.match(renderUserRow({ id: 2, username: 'admin', rol: 'admin' }, 'platform'), /Resetear contraseña/);
  assert.doesNotMatch(renderUserRow({ id: 4, username: 'platform-target', rol: 'platform_admin' }, 'platform'), /Resetear contraseña/);
});

test('el listado de clientes muestra administradores, ausencia y selección múltiple', () => {
  const {
    renderClientRow,
  } = require('./platform-panel-render');

  assert.match(renderClientRow({ id: 1, nombre: 'Sin admin', administradores: [] }), /Sin administrador/);
  const one = renderClientRow({
    id: 2,
    nombre: 'Uno',
    administradores: [{ id: 20, nombre: 'Ana', username: 'ana', rol: 'admin' }],
  });
  assert.match(one, /Ana/);
  assert.match(one, /ana/);
  assert.match(one, /Resetear contraseña/);
  const multiple = renderClientRow({
    id: 3,
    nombre: 'Varios',
    administrador_principal: { id: 30, nombre: 'Ana', username: 'ana', rol: 'admin' },
    cantidad_administradores: 2,
    administradores: [
      { id: 30, nombre: 'Ana', username: 'ana', rol: 'admin' },
      { id: 31, nombre: 'Beto', username: 'beto', rol: 'admin' },
    ],
  });
  assert.match(multiple, /2 administradores/);
  assert.match(multiple, /El administrador principal es el más antiguo|más antiguo|administradores/);
  assert.match(multiple, /Ana/);
  assert.match(multiple, /ana/);
  assert.doesNotMatch(multiple, /Beto/);
  assert.match(multiple, /data-reset-user-id="30"/);
  assert.doesNotMatch(multiple, /data-reset-user-id="31"/);
});

test('el listado usa el admin más antiguo cuando la API ya incluye el principal', () => {
  const { renderClientRow } = require('./platform-panel-render');
  const html = renderClientRow({
    id: 4,
    nombre: 'Cliente legado',
    cantidad_administradores: 2,
    administrador_principal: { id: 11, nombre: 'Admin creado primero', username: 'admin', rol: 'admin' },
    administradores: [
      { id: 11, nombre: 'Admin creado primero', username: 'admin', rol: 'admin' },
      { id: 12, nombre: 'Admin posterior', username: 'admin2', rol: 'admin' },
    ],
  });
  assert.match(html, /Admin creado primero/);
  assert.match(html, /2 administradores/);
  assert.doesNotMatch(html, /Admin posterior/);
  assert.match(html, /data-reset-user-id="11"/);
});

test('el listado usa tarjetas visuales accesibles y columnas de usuarios y acciones', () => {
  const { renderClientRow, renderUserRow, rolEtiqueta } = require('./platform-panel-render');
  const row = renderClientRow({
    id: 5,
    nombre: 'Cliente Visual',
    usuarios_count: 4,
    administrador_principal: { id: 21, nombre: 'Ana López', username: 'ana', rol: 'admin' },
    cantidad_administradores: 1,
  });
  assert.match(row, /Ana/);
  assert.match(row, /<span[^>]*>AL<\/span>/);
  assert.match(row, />4<\/strong>/);
  assert.match(row, /title="Resetear contraseña de Ana López"/);
  assert.match(row, /aria-label="Resetear contraseña de Ana López"/);
  assert.match(row, /Ver usuarios/);

  const userRow = renderUserRow({ id: 22, username: 'operario', nombre: 'Operario Uno', rol: 'comun' }, 'platform');
  assert.match(userRow, /Usuario/);
  assert.match(userRow, /Resetear contraseña/);
  assert.match(rolEtiqueta('admin'), /Administrador/);
  assert.match(rolEtiqueta('comun'), /Usuario/);
});
