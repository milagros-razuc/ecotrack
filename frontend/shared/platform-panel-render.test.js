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
  assert.doesNotMatch(page, />Acción</);
});
