const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { etiquetaRolSidebar } = require('./sidebar-role');

test('etiquetaRolSidebar muestra la etiqueta correspondiente', () => {
  assert.equal(etiquetaRolSidebar('platform_admin'), 'Plataforma');
  assert.equal(etiquetaRolSidebar('admin'), 'Administrador');
  assert.equal(etiquetaRolSidebar('comun'), 'Usuario');
  assert.equal(etiquetaRolSidebar('otro'), 'Usuario');
});

test('cada link de tenant del sidebar desktop y móvil está marcado', () => {
  const sidebar = fs.readFileSync(path.join(__dirname, 'sidebar.html'), 'utf8');
  const tenantPages = ['index', 'historico', 'configuracion', 'auditor'];

  for (const page of tenantPages) {
    const links = [...sidebar.matchAll(new RegExp(`<a[^>]*data-page="${page}"[^>]*>`, 'g'))];
    assert.equal(links.length, 2, `se esperaban dos links para ${page}`);
    for (const link of links) {
      assert.match(link[0], /data-tenant-only/);
    }
  }
});
