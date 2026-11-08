const assert = require('node:assert/strict');
const test = require('node:test');
const { destinoPorRol, decidirAcceso } = require('./role-routing');

test('destinoPorRol resuelve el destino seguro según rol', () => {
  assert.equal(destinoPorRol('platform_admin'), 'plataforma.html');
  assert.equal(destinoPorRol('admin'), 'index.html');
  assert.equal(destinoPorRol('comun'), 'index.html');
  assert.equal(destinoPorRol(), 'index.html');
  assert.equal(destinoPorRol('desconocido'), 'index.html');
});

for (const rol of ['platform_admin', 'admin', 'comun']) {
  for (const pagina of ['plataforma', 'cliente']) {
    test(`decidirAcceso ${rol} en ${pagina} con sesión`, () => {
      const resultado = decidirAcceso({ rol, pagina, haySesion: true });
      const permitido = pagina === 'plataforma'
        ? rol === 'platform_admin'
        : rol !== 'platform_admin';

      assert.deepEqual(resultado, permitido
        ? { permitido: true }
        : { permitido: false, destino: destinoPorRol(rol) });
    });

    test(`decidirAcceso ${rol} en ${pagina} sin sesión`, () => {
      assert.deepEqual(
        decidirAcceso({ rol, pagina, haySesion: false }),
        { permitido: false, destino: 'login.html' },
      );
    });
  }
}

test('decidirAcceso no concede privilegios a un rol desconocido', () => {
  assert.deepEqual(
    decidirAcceso({ rol: 'desconocido', pagina: 'plataforma', haySesion: true }),
    { permitido: false, destino: 'index.html' },
  );
});
