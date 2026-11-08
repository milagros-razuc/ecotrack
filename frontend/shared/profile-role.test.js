const assert = require('node:assert/strict');
const test = require('node:test');
const { etiquetaRolPerfil } = require('./sidebar-role');

test('etiquetaRolPerfil no muestra platform_admin como Común', () => {
  assert.equal(etiquetaRolPerfil('platform_admin'), 'Plataforma');
  assert.equal(etiquetaRolPerfil('admin'), 'Administrador');
  assert.equal(etiquetaRolPerfil('comun'), 'Común');
});
