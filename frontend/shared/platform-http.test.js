const assert = require('node:assert/strict');
const test = require('node:test');
const { accionPorEstadoHttp } = require('./platform-http');

test('accionPorEstadoHttp cierra sesión ante 401', () => {
  assert.deepEqual(accionPorEstadoHttp({ status: 401, rol: 'platform_admin' }), {
    accion: 'cerrar-sesion',
  });
});

test('accionPorEstadoHttp no redirige ante 403', () => {
  assert.deepEqual(accionPorEstadoHttp({ status: 403, rol: 'platform_admin' }), {
    accion: 'cerrar-sesion',
  });
  assert.notEqual(accionPorEstadoHttp({ status: 403, rol: 'platform_admin' }).destino, 'plataforma.html');
});

test('accionPorEstadoHttp informa error genérico para otros estados', () => {
  assert.deepEqual(accionPorEstadoHttp({ status: 500, rol: 'platform_admin' }), {
    accion: 'error',
    mensaje: 'No se pudo cargar el panel',
  });
});
