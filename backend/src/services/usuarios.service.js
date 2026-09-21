const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function listar(clienteId) {
  const result = await pool.query(
    'SELECT id, username, nombre, rol, creado_en FROM usuarios WHERE cliente_id = $1 ORDER BY creado_en DESC',
    [clienteId]
  );
  return result.rows;
}

async function crear({ username, password, nombre, rol, clienteId }) {
  // El username sigue siendo único a nivel global (no compuesto con
  // cliente_id), así que esta validación no cambia.
  const { rows: existentes } = await pool.query(
    'SELECT id FROM usuarios WHERE username = $1',
    [username]
  );
  if (existentes[0]) {
    return { error: 'El nombre de usuario ya existe' };
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO usuarios (username, password_hash, nombre, rol, cliente_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, nombre, rol, creado_en`,
    [username, hash, nombre || null, rol, clienteId]
  );
  return { usuario: result.rows[0] };
}

async function actualizar(id, { nombre, rol }, clienteId) {
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1 AND cliente_id = $2', [id, clienteId]);
  const usuario = rows[0];
  if (!usuario) {
    return { error: 'Usuario no encontrado' };
  }

  // Si se está bajando de admin a común, no puede ser el único admin
  // activo DE ESE CLIENTE (cada cliente necesita su propio admin).
  if (rol && rol !== 'admin' && usuario.rol === 'admin') {
    const quedaOtroAdmin = await hayOtroAdminActivo(id, clienteId);
    if (!quedaOtroAdmin) {
      return { error: 'No se puede quitar el rol de administrador: es el único admin activo' };
    }
  }

  const nuevoNombre = nombre !== undefined ? nombre : usuario.nombre;
  const nuevoRol = rol !== undefined ? rol : usuario.rol;

  const result = await pool.query(
    `UPDATE usuarios SET nombre = $1, rol = $2 WHERE id = $3 AND cliente_id = $4
     RETURNING id, username, nombre, rol, creado_en`,
    [nuevoNombre, nuevoRol, id, clienteId]
  );
  return { usuario: result.rows[0] };
}

async function eliminar(id, solicitanteId, clienteId) {
  // Regla de gestión de usuarios (sección 3.5): un usuario no puede
  // eliminar su propia cuenta.
  if (parseInt(id, 10) === parseInt(solicitanteId, 10)) {
    return { error: 'No podés eliminar tu propia cuenta' };
  }

  const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1 AND cliente_id = $2', [id, clienteId]);
  const usuario = rows[0];
  if (!usuario) {
    return { error: 'Usuario no encontrado' };
  }

  if (usuario.rol === 'admin') {
    const quedaOtroAdmin = await hayOtroAdminActivo(id, clienteId);
    if (!quedaOtroAdmin) {
      return { error: 'No se puede eliminar: es el único administrador activo' };
    }
  }

  await pool.query('DELETE FROM usuarios WHERE id = $1 AND cliente_id = $2', [id, clienteId]);
  return { ok: true };
}

// Verifica si, excluyendo el usuario "id", queda al menos otro admin
// DENTRO DEL MISMO CLIENTE.
async function hayOtroAdminActivo(id, clienteId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND cliente_id = $1 AND id != $2`,
    [clienteId, id]
  );
  return parseInt(rows[0].count, 10) > 0;
}

module.exports = { listar, crear, actualizar, eliminar };
