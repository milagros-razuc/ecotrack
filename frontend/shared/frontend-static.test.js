const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const frontend = path.join(__dirname, '..');
const pages = fs.readdirSync(frontend)
  .filter(file => file.endsWith('.html'))
  .filter(file => fs.readFileSync(path.join(frontend, file), 'utf8').includes('shared/app.js'));

test('cada página con app.js carga sus módulos antes del shell y declara data-page', () => {
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const source = fs.readFileSync(path.join(frontend, page), 'utf8');
    const appIndex = source.indexOf('<script src="shared/app.js"');
    for (const module of ['role-routing.js', 'html-escape.js', 'sidebar-role.js']) {
      assert.ok(source.indexOf(module) >= 0 && source.indexOf(module) < appIndex, `${page} debe cargar ${module} antes de app.js`);
    }
    assert.match(source, /data-page="/, `${page} debe declarar data-page`);
  }
});

test('el guard no declara identificadores globales que colisionen con las páginas', () => {
  const app = fs.readFileSync(path.join(frontend, 'shared', 'app.js'), 'utf8');
  assert.doesNotMatch(app, /^\s*(?:const|let|var)\s+(?:pagina|acceso)\b/m);
});

test('npm test incluye los tests frontend compartidos', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(frontend, '..', 'backend', 'package.json'), 'utf8'));
  assert.match(packageJson.scripts.test, /\.\.\/frontend\/shared\/\*\.test\.js/);
});
