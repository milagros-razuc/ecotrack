const poolPorDefecto = require('../config/db');
const {
  createDynamicSecurityService,
  identityFor,
} = require('./dynamicSecurity.service');

const ERROR_RESET_CREDENCIALES = 'No se pudo resetear las credenciales del dispositivo';

class ResetCredencialesError extends Error {
  constructor() {
    super(ERROR_RESET_CREDENCIALES);
    this.name = 'ResetCredencialesError';
  }
}

function createResetCredencialesService({
  pool = poolPorDefecto,
  dynamicSecurity = createDynamicSecurityService(),
} = {}) {
  async function resetear({ deviceId, clienteId }) {
    const client = await pool.connect();
    let dynamicSecurityRemoved = false;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT f.device_id, f.enrolled_at, d.cliente_id, d.reclamado_en
         FROM dispositivos_fabrica f
         JOIN dispositivos d ON d.codigo = f.device_id
         WHERE f.device_id = $1 AND d.cliente_id = $2
         FOR UPDATE OF f, d`,
        [deviceId, clienteId],
      );
      const row = result.rows[0];
      if (!row || !row.reclamado_en || row.cliente_id !== clienteId) {
        throw new ResetCredencialesError();
      }

      if (!row.enrolled_at) {
        await client.query('ROLLBACK');
        return { status: 'already_reset', device_id: deviceId };
      }

      await dynamicSecurity.removeDevice(identityFor(deviceId, ''));
      dynamicSecurityRemoved = true;

      const update = await client.query(
        `UPDATE dispositivos_fabrica
         SET enrolled_at = NULL
         WHERE device_id = $1 AND enrolled_at IS NOT NULL
         RETURNING device_id`,
        [deviceId],
      );
      if (update.rowCount !== 1) throw new ResetCredencialesError();
      await client.query('COMMIT');
      return { status: 'reset', device_id: deviceId };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the sanitized public error.
      }
      if (dynamicSecurityRemoved) {
        console.error('Reset de credenciales requiere reconciliación manual');
      }
      if (error instanceof ResetCredencialesError) throw error;
      throw new ResetCredencialesError();
    } finally {
      client.release();
    }
  }

  return { resetear };
}

const defaultService = createResetCredencialesService();

module.exports = {
  ERROR_RESET_CREDENCIALES,
  ResetCredencialesError,
  createResetCredencialesService,
  resetear: defaultService.resetear,
};
