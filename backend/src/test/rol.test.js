const assert = require('node:assert/strict');
const test = require('node:test');
const rol = require('../middleware/rol');

function responseDouble() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('CP-RF17 verificarRol admin deja pasar al administrador', () => {
  const res = responseDouble();
  let called = false;
  rol('admin')({ usuario: { rol: 'admin' } }, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, null);
});

test('CP-RF17 verificarRol admin devuelve 403 al rol comun', () => {
  const res = responseDouble();
  let called = false;
  rol('admin')({ usuario: { rol: 'comun' } }, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('CP-RF17 verificarRol admin devuelve 401 sin token autenticado', () => {
  const res = responseDouble();
  rol('admin')({}, res, () => {});
  assert.equal(res.statusCode, 401);
});

function assertAdminGuard(router, routePath, method) {
  const routeLayer = router.stack.find(layer => layer.route
    && layer.route.path === routePath
    && layer.route.methods[method]);
  assert.ok(routeLayer, `no se encontró ${method.toUpperCase()} ${routePath}`);
  const guard = routeLayer.route.stack[0];
  assert.ok(guard, `la ruta ${method.toUpperCase()} ${routePath} no tiene verificarRol`);
  const res = responseDouble();
  let called = false;
  guard.handle({ usuario: { rol: 'comun' } }, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
}

test('CP-RF17 rutas Admin de dispositivos rechazan llamada directa de usuario comun', () => {
  const router = require('../routes/dispositivos');
  assertAdminGuard(router, '/', 'post');
  assertAdminGuard(router, '/:codigo', 'delete');
});

test('CP-RF17 POST umbrales rechaza llamada directa de usuario comun', () => {
  const router = require('../routes/umbrales');
  assertAdminGuard(router, '/', 'post');
});

test('CP-RF17 todas las rutas de usuarios rechazan llamada directa de usuario comun', () => {
  const router = require('../routes/usuarios');
  const guard = router.stack.find(item => !item.route);
  assert.ok(guard);
  for (const layer of router.stack.filter(item => item.route)) {
    const res = responseDouble();
    let called = false;
    guard.handle({ usuario: { rol: 'comun' } }, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
    assert.ok(layer.route.path.startsWith('/'));
  }
});
