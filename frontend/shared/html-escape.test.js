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
