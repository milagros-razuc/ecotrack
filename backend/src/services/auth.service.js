const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { getActiveRegistry } = require('../realtime/socketRegistry');
const auditoriaService = require('./auditoria.service');
const { validarPasswordNueva } = require('./password-policy.service');
const { BCRYPT_COST } = require('../config/security');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '12h';
const PASSWORD_CHANGE_TOKEN_EXPIRES_IN = '10m';
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('ecotrack-invalid-password', BCRYPT_COST);

async function login(username, password) {
  const { rows } = await pool.query(
    `SELECT id, username, password_hash, nombre, rol, cliente_id, token_version,
            must_change_password, password_temporal_expira
     FROM usuarios WHERE username = $1`,
    [username]
  );
  const usuario = rows[0];

  const passwordValida = await bcrypt.compare(
    password,
    usuario?.password_hash || DUMMY_PASSWORD_HASH,
  );
  const temporalVencida = usuario?.password_temporal_expira
    && new Date(usuario.password_temporal_expira).getTime() <= Date.now();
  if (!usuario || !passwordValida || temporalVencida) {
    return { error: 'Usuario o contraseña incorrectos' };
  }

  const cambioPendiente = usuario.must_change_password === true;
  const token = jwt.sign(
  {
    sub: usuario.id,
    username: usuario.username,
    rol: usuario.rol,
    clienteId: usuario.cliente_id,
    tv: usuario.token_version,
    ...(cambioPendiente ? { scope: 'change-password' } : {}),
  },
  JWT_SECRET,
  { expiresIn: cambioPendiente ? PASSWORD_CHANGE_TOKEN_EXPIRES_IN : JWT_EXPIRES_IN },
  );

  return {
    token,
    username: usuario.username,
    nombre: usuario.nombre,
    rol: usuario.rol,
    mustChangePassword: cambioPendiente,
  };
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(
    `SELECT id, username, nombre, rol, creado_en, must_change_password
     FROM usuarios WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function cambiarPassword(id, passwordActual, passwordNueva, { ip = null } = {}) {
  const client = await pool.connect();
  let committed = false;
  let usuario;
  let resultado;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, username, nombre, rol, cliente_id, password_hash,
              must_change_password, password_temporal_expira, token_version
       FROM usuarios WHERE id = $1 FOR UPDATE`,
      [id],
    );
    usuario = rows[0];
    if (!usuario) {
      resultado = { error: 'La contraseña actual es incorrecta' };
    } else {
      const passwordValida = await bcrypt.compare(passwordActual, usuario.password_hash);
      const temporalVencida = usuario.password_temporal_expira
        && new Date(usuario.password_temporal_expira).getTime() <= Date.now();
      const politica = validarPasswordNueva(
        passwordNueva,
        usuario.must_change_password ? passwordActual : null,
      );
      if (!passwordValida || temporalVencida) {
        resultado = { error: 'La contraseña actual es incorrecta' };
      } else if (!politica.valida) {
        resultado = { error: politica.error };
      } else if (passwordNueva === passwordActual) {
        resultado = { error: 'La nueva contraseña no puede ser igual a la contraseña actual' };
      }
    }

    if (resultado) {
      if (usuario) {
        await auditoriaService.registrarEnTransaccion(client, {
          clienteId: usuario.cliente_id,
          usuarioId: usuario.id,
          usuarioUsername: usuario.username,
          actorTipo: usuario.rol === 'platform_admin' ? 'platform_admin' : 'tenant',
          accion: 'change_password',
          entidad: 'usuarios',
          entidadId: String(usuario.id),
          detalle: JSON.stringify({ ip, resultado: 'rechazado' }),
        });
      }
      await client.query('COMMIT');
      committed = true;
      return resultado;
    }

    const nuevoHash = await bcrypt.hash(passwordNueva, BCRYPT_COST);
    const { rows: actualizados } = await client.query(
      `UPDATE usuarios
       SET password_hash = $1,
           password_temporal_expira = NULL,
           must_change_password = false,
           token_version = token_version + 1
       WHERE id = $2
       RETURNING id, token_version, username, rol, cliente_id`,
      [nuevoHash, id],
    );
    const u = actualizados[0];
    await auditoriaService.registrarEnTransaccion(client, {
      clienteId: u.cliente_id,
      usuarioId: u.id,
      usuarioUsername: u.username,
      actorTipo: u.rol === 'platform_admin' ? 'platform_admin' : 'tenant',
      accion: 'change_password',
      entidad: 'usuarios',
      entidadId: String(u.id),
      detalle: JSON.stringify({ ip, resultado: 'exitoso' }),
    });
    await client.query('COMMIT');
    committed = true;
    getActiveRegistry()?.disconnectUserSockets(id);

    const token = jwt.sign(
      { sub: id, username: u.username, rol: u.rol, clienteId: u.cliente_id, tv: u.token_version },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    return { ok: true, token };
  } catch (error) {
    if (!committed) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }
}

// Edita el nombre visible del perfil propio 
async function actualizarPerfil(id, { nombre }) {
  const { rows } = await pool.query(
    'UPDATE usuarios SET nombre = $1 WHERE id = $2 RETURNING id, username, nombre, rol, creado_en',
    [nombre, id]
  );
  return rows[0] || null;
}

module.exports = { login, obtenerPorId, cambiarPassword, actualizarPerfil };
