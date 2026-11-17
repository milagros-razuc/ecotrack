const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const auditoriaService = require('./auditoria.service');
const { getActiveRegistry } = require('../realtime/socketRegistry');

const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*+-_=';
const TEMPORARY_PASSWORD_LENGTH = 16;

class PasswordResetError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'PasswordResetError';
    this.code = code;
    this.status = status;
  }
}

function puedeResetear(solicitante, objetivo) {
  if (!solicitante || !objetivo || solicitante.id === objetivo.id) return false;
  if (objetivo.rol === 'platform_admin' || solicitante.rol === objetivo.rol) return false;

  if (solicitante.rol === 'admin') {
    return objetivo.rol === 'comun' && solicitante.cliente_id === objetivo.cliente_id;
  }

  return solicitante.rol === 'platform_admin'
    && (objetivo.rol === 'admin' || objetivo.rol === 'comun');
}

function generarPasswordTemporal(length = TEMPORARY_PASSWORD_LENGTH) {
  if (!Number.isInteger(length) || length < 12) {
    throw new RangeError('La contraseña temporal debe tener al menos 12 caracteres');
  }

  const result = [];
  const limit = 256 - (256 % TEMPORARY_PASSWORD_ALPHABET.length);
  while (result.length < length) {
    const bytes = crypto.randomBytes(length - result.length + 8);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      result.push(TEMPORARY_PASSWORD_ALPHABET[byte % TEMPORARY_PASSWORD_ALPHABET.length]);
      if (result.length === length) break;
    }
  }
  return result.join('');
}

async function resetearPassword({ solicitanteId, objetivoId, ip }) {
  const client = await pool.connect();
  let objetivo;
  let committed = false;

  try {
    await client.query('BEGIN');
    const { rows: actores } = await client.query(
      'SELECT id, username, rol, cliente_id FROM usuarios WHERE id = $1 FOR UPDATE',
      [solicitanteId],
    );
    const solicitante = actores[0];
    if (!solicitante) {
      throw new PasswordResetError('NOT_FOUND', 404, 'Usuario no encontrado');
    }

    const { rows: objetivos } = await client.query(
      `SELECT id, username, nombre, rol, cliente_id
       FROM usuarios WHERE id = $1 FOR UPDATE`,
      [objetivoId],
    );
    objetivo = objetivos[0];

    if (!objetivo) {
      throw new PasswordResetError('NOT_FOUND', 404, 'Usuario no encontrado');
    }

    const permitido = puedeResetear(solicitante, objetivo);
    const tenantOculto = solicitante.rol === 'admin'
      && solicitante.cliente_id !== objetivo.cliente_id;
    if (!permitido || tenantOculto) {
      await auditoriaService.registrarEnTransaccion(client, {
        clienteId: objetivo.cliente_id,
        usuarioId: solicitante.id,
        usuarioUsername: solicitante.username,
        actorTipo: solicitante.rol === 'platform_admin' ? 'platform_admin' : 'tenant',
        accion: 'reset_password',
        entidad: 'usuarios',
        entidadId: String(objetivo.id),
        detalle: JSON.stringify({ ip, resultado: 'rechazado' }),
      });
      await client.query('COMMIT');
      committed = true;
      const error = tenantOculto
        ? new PasswordResetError('NOT_FOUND', 404, 'Usuario no encontrado')
        : new PasswordResetError('FORBIDDEN', 403, 'No tenés permisos para resetear este usuario');
      throw error;
    }

    const passwordTemporal = generarPasswordTemporal();
    const passwordHash = await bcrypt.hash(passwordTemporal, 10);
    const { rows: actualizados } = await client.query(
      `UPDATE usuarios
       SET password_hash = $1,
           must_change_password = true,
           password_temporal_expira = NOW() + INTERVAL '24 hours',
           token_version = token_version + 1
       WHERE id = $2
       RETURNING id, username, nombre, password_temporal_expira`,
      [passwordHash, objetivo.id],
    );

    await auditoriaService.registrarEnTransaccion(client, {
      clienteId: objetivo.cliente_id,
      usuarioId: solicitante.id,
      usuarioUsername: solicitante.username,
      actorTipo: solicitante.rol === 'platform_admin' ? 'platform_admin' : 'tenant',
      accion: 'reset_password',
      entidad: 'usuarios',
      entidadId: String(objetivo.id),
      detalle: JSON.stringify({ ip, resultado: 'exitoso' }),
    });

    await client.query('COMMIT');
    committed = true;
    getActiveRegistry()?.disconnectUserSockets(objetivo.id);

    return {
      usuario: {
        id: actualizados[0].id,
        username: actualizados[0].username,
        nombre: actualizados[0].nombre,
      },
      password_temporal: passwordTemporal,
      expira_en: actualizados[0].password_temporal_expira,
    };
  } catch (error) {
    if (!committed) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original transaction error.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  PasswordResetError,
  TEMPORARY_PASSWORD_ALPHABET,
  TEMPORARY_PASSWORD_LENGTH,
  generarPasswordTemporal,
  puedeResetear,
  resetearPassword,
};
