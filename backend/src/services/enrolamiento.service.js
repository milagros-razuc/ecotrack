const crypto = require('crypto');
const poolPorDefecto = require('../config/db');
const { createDynamicSecurityService } = require('./dynamicSecurity.service');

const ERROR_ENROLAMIENTO = 'No se pudo enrolar el dispositivo';

class EnrollmentError extends Error {
  constructor() {
    super(ERROR_ENROLAMIENTO);
    this.name = 'EnrollmentError';
  }
}

function hashFactorySecret(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function hashesEqual(expectedHex, actualHex) {
  const expected = /^[0-9a-f]{64}$/i.test(expectedHex || '')
    ? Buffer.from(expectedHex, 'hex')
    : Buffer.alloc(32);
  const actual = Buffer.from(actualHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(expected, actual);
}

function createEnrollmentService({
  pool = poolPorDefecto,
  dynamicSecurity = createDynamicSecurityService(),
  randomBytes = crypto.randomBytes,
  mqttHost = process.env.MQTT_PUBLIC_HOST || 'localhost',
  mqttPort = Number(process.env.MQTT_PORT || 8883),
} = {}) {
  async function enrolar({ deviceId, deviceSecret }) {
    const client = await pool.connect();
    let identity;
    let committed = false;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT f.device_id, f.factory_secret_hash, f.enrolled_at,
                d.cliente_id, d.reclamado_en
         FROM dispositivos_fabrica f
         JOIN dispositivos d ON d.codigo = f.device_id
         WHERE f.device_id = $1
         FOR UPDATE OF f, d`,
        [deviceId],
      );
      const row = result.rows[0];
      const secretHash = hashFactorySecret(deviceSecret);
      const valid = row
        && row.reclamado_en
        && row.cliente_id !== null
        && row.enrolled_at === null
        && hashesEqual(row.factory_secret_hash, secretHash);
      if (!valid) throw new EnrollmentError();

      const password = randomBytes(32).toString('base64url');
      identity = await dynamicSecurity.provisionDevice({
        deviceId: row.device_id,
        password,
        clienteId: row.cliente_id,
      });
      const update = await client.query(
        `UPDATE dispositivos_fabrica
         SET enrolled_at = NOW()
         WHERE device_id = $1 AND enrolled_at IS NULL
         RETURNING device_id`,
        [row.device_id],
      );
      if (update.rowCount !== 1) throw new EnrollmentError();
      await client.query('COMMIT');
      committed = true;

      return {
        device_id: row.device_id,
        mqtt_user: identity.username,
        mqtt_pass: identity.password,
        mqtt_host: mqttHost,
        mqtt_port: mqttPort,
      };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The original generic enrollment error is preserved.
      }
      if (identity && !committed) {
        try {
          await dynamicSecurity.removeDevice(identity);
        } catch {
          console.error('No se pudo confirmar el rollback de dynamic-security para el enrolamiento');
        }
      }
      throw new EnrollmentError();
    } finally {
      client.release();
    }
  }

  return { enrolar };
}

const defaultService = createEnrollmentService();

module.exports = {
  ERROR_ENROLAMIENTO,
  EnrollmentError,
  hashFactorySecret,
  hashesEqual,
  createEnrollmentService,
  enrolar: defaultService.enrolar,
};
