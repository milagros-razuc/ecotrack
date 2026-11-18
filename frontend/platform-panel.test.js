const assert = require('node:assert/strict');
const test = require('node:test');
const {
  shouldRenderPlatformPanel,
  requestResetConfirmation,
} = require('./platform-panel.test-support');

test('el harness del panel cubre rol y confirmación de reset', () => {
  assert.equal(shouldRenderPlatformPanel('platform_admin'), true);
  assert.equal(shouldRenderPlatformPanel('admin'), false);
  assert.equal(requestResetConfirmation(() => true), true);
  assert.equal(requestResetConfirmation(() => false), false);
});

test('la estructura incluye una página Clientes exclusiva y separa usuarios por cliente', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const plataforma = fs.readFileSync(path.join(__dirname, 'plataforma.html'), 'utf8');
  const clientes = fs.readFileSync(path.join(__dirname, 'clientes.html'), 'utf8');
  assert.doesNotMatch(plataforma, /Usuarios por cliente/);
  assert.doesNotMatch(plataforma, /usuarios-cliente/);
  assert.match(clientes, /data-page="clientes"/);
  assert.match(clientes, /Usuarios por cliente/);
  assert.match(clientes, /Contraseña temporal/);
  assert.match(clientes, /<th[^>]*>Cliente<\/th>/);
  assert.match(clientes, /<th[^>]*>Administrador<\/th>/);
  assert.match(clientes, /<th[^>]*>Usuarios<\/th>/);
  assert.match(clientes, /<th[^>]*>Acciones<\/th>/);
  assert.doesNotMatch(clientes, /<select[^>]*usuarios-cliente/);
  assert.match(clientes, /scrollIntoView/);
});
