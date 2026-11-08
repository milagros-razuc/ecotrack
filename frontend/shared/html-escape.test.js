const assert = require('node:assert/strict');
const test = require('node:test');
const { escapeHtml } = require('./html-escape');
const { renderDeviceRow, renderSummaryItem } = require('./platform-panel-render');

test('escapeHtml escapa todos los caracteres HTML peligrosos y tolera null', () => {
  assert.equal(escapeHtml(`<img src=x onerror=alert(1)> " '`), '&lt;img src=x onerror=alert(1)&gt; &quot; &#39;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('renderDeviceRow escapa todos los valores dinámicos del dispositivo', () => {
  const html = renderDeviceRow({
    codigo: '"D-001"',
    cliente: '<img src=x onerror=alert(1)>',
    estado: '<script>alert(1)</script>',
    firmware_version: '<script>alert(1)</script>',
    online: 'online',
    ultima_lectura: null,
  });

  assert.doesNotMatch(html, /<img|<script>/);
  assert.match(html, /&quot;D-001&quot;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('renderSummaryItem escapa el estado y el total', () => {
  const html = renderSummaryItem('<script>alert(1)</script>', '<img src=x>');

  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
});

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

test('plataforma define los encabezados de las siete columnas', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const page = fs.readFileSync(path.join(__dirname, '..', 'plataforma.html'), 'utf8');

  for (const header of ['Código', 'Cliente', 'Estado', 'Firmware', 'Conexión', 'Última lectura', 'Última conexión']) {
    assert.match(page, new RegExp(`<th[^>]*>${header}</th>`));
  }
  assert.doesNotMatch(page, />Acción</);
});
