(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ecotrackClienteAlta = api;
})(typeof window !== 'undefined' ? window : null, function () {
  const reglas = [
    ['nombreCliente', 'nombre_cliente', 1, 100],
    ['username', 'username', 3, 50],
    ['nombreAdmin', 'nombre_admin', 1, 100],
    ['motivo', 'motivo', 3, 200],
  ];

  function validarAltaCliente(campos) {
    const datos = {};

    for (const [campo, clave, minimo, maximo] of reglas) {
      const valor = campos && typeof campos[campo] === 'string'
        ? campos[campo].trim()
        : null;

      if (valor === null || valor.length < minimo || valor.length > maximo) {
        return { ok: false, error: `El campo ${campo} debe tener entre ${minimo} y ${maximo} caracteres` };
      }

      datos[clave] = valor;
    }

    return { ok: true, datos };
  }

  return { validarAltaCliente };
});
