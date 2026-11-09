const assert = require('node:assert/strict');
const test = require('node:test');
const { validarAltaCliente } = require('./cliente-alta');

const camposValidos = {
  nombreCliente: 'Cliente EcoTrack',
  username: 'admin.ecotrack',
  nombreAdmin: 'Admin Inicial',
  motivo: 'Alta inicial del cliente',
};

function resultadoInvalido(campos, campo) {
  const resultado = validarAltaCliente({ ...camposValidos, ...campos });
  assert.equal(resultado.ok, false);
  assert.match(resultado.error, new RegExp(campo, 'i'));
}

test('valida y recorta los campos, con datos snake_case estrictos', () => {
  const resultado = validarAltaCliente({
    nombreCliente: '  Cliente EcoTrack  ',
    username: '  admin.ecotrack  ',
    nombreAdmin: '  Admin Inicial  ',
    motivo: '  Alta inicial del cliente  ',
  });

  assert.deepEqual(resultado, {
    ok: true,
    datos: {
      nombre_cliente: 'Cliente EcoTrack',
      username: 'admin.ecotrack',
      nombre_admin: 'Admin Inicial',
      motivo: 'Alta inicial del cliente',
    },
  });
  assert.deepEqual(Object.keys(resultado.datos), [
    'nombre_cliente',
    'username',
    'nombre_admin',
    'motivo',
  ]);
});

test('rechaza cada campo vacío', () => {
  resultadoInvalido({ nombreCliente: '' }, 'nombreCliente');
  resultadoInvalido({ username: '' }, 'username');
  resultadoInvalido({ nombreAdmin: '' }, 'nombreAdmin');
  resultadoInvalido({ motivo: '' }, 'motivo');
});

test('rechaza cada campo compuesto solo por espacios', () => {
  resultadoInvalido({ nombreCliente: '   ' }, 'nombreCliente');
  resultadoInvalido({ username: '   ' }, 'username');
  resultadoInvalido({ nombreAdmin: '   ' }, 'nombreAdmin');
  resultadoInvalido({ motivo: '   ' }, 'motivo');
});

test('username requiere al menos 3 caracteres', () => {
  resultadoInvalido({ username: 'ab' }, 'username');
  assert.equal(validarAltaCliente({ ...camposValidos, username: 'abc' }).ok, true);
});

test('motivo requiere al menos 3 caracteres', () => {
  resultadoInvalido({ motivo: 'ab' }, 'motivo');
  assert.equal(validarAltaCliente({ ...camposValidos, motivo: 'abc' }).ok, true);
});

test('acepta los límites máximos de los cuatro campos', () => {
  const resultado = validarAltaCliente({
    nombreCliente: 'n'.repeat(100),
    username: 'u'.repeat(50),
    nombreAdmin: 'a'.repeat(100),
    motivo: 'm'.repeat(200),
  });

  assert.equal(resultado.ok, true);
});

test('rechaza un carácter por encima del límite máximo de cada campo', () => {
  resultadoInvalido({ nombreCliente: 'n'.repeat(101) }, 'nombreCliente');
  resultadoInvalido({ username: 'u'.repeat(51) }, 'username');
  resultadoInvalido({ nombreAdmin: 'a'.repeat(101) }, 'nombreAdmin');
  resultadoInvalido({ motivo: 'm'.repeat(201) }, 'motivo');
});

test('no lanza excepción con entradas nulas, indefinidas o campos no string', () => {
  assert.doesNotThrow(() => validarAltaCliente(null));
  assert.doesNotThrow(() => validarAltaCliente(undefined));
  assert.doesNotThrow(() => validarAltaCliente({ ...camposValidos, username: 123 }));
});
