const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '12h';

async function login(username, password) {
  const { rows } = await pool.query(
    'SELECT * FROM usuarios WHERE username = $1',
    [username]
  );
  const usuario = rows[0];

  // Mensaje genérico a propósito: no reveleamos si falló por usuario
  // inexistente o por contraseña incorrecta.
  if (!usuario) {
    return { error: 'Usuario o contraseña incorrectos' };
  }

  const passwordValida = await bcrypt.compare(password, usuario.password_hash);
  if (!passwordValida) {
    return { error: 'Usuario o contraseña incorrectos' };
  }

  const token = jwt.sign(
    { sub: usuario.id, username: usuario.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    token,
    username: usuario.username,
    nombre: usuario.nombre,
  };
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(
    'SELECT id, username, nombre, creado_en FROM usuarios WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function cambiarPassword(id, passwordActual, passwordNueva) {
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
  const usuario = rows[0];

  if (!usuario) {
    return { error: 'Usuario no encontrado' };
  }

  const passwordValida = await bcrypt.compare(passwordActual, usuario.password_hash);
  if (!passwordValida) {
    return { error: 'La contraseña actual es incorrecta' };
  }

  const nuevoHash = await bcrypt.hash(passwordNueva, 10);
  await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [nuevoHash, id]);

  return { ok: true };
}

module.exports = { login, obtenerPorId, cambiarPassword };
