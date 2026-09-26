const crypto = require('crypto');
const pool = require('../config/db');

// SHA-256 de la clave completa. No es bcrypt a propósito (ver comentario
// en migrate.js): la clave no es una contraseña de humano, son 256 bits
// random no adivinables por diccionario, y necesitamos buscar por hash
// exacto en O(1) contra clave_hash en cada request público — con bcrypt
// habría que probar contra cada fila, no se puede indexar la comparación.
function hashClave(clave) {
  return crypto.createHash('sha256').update(clave, 'utf8').digest('hex');
}

// Middleware de autenticación para /api/public/*. Es el equivalente de
// verificarToken + extraerCliente, pero para consumidores externos: en vez
// de JWT de sesión, lee una API key del header X-Api-Key y resuelve
// req.clienteId a partir de ella. Las rutas públicas NO deben montarse
// detrás de verificarToken — usan este middleware en su lugar.
async function verificarApiKey(req, res, next) {
  const clave = req.headers['x-api-key'];

  if (!clave) {
    return res.status(401).json({ error: 'Falta la API key (header X-Api-Key)' });
  }

  try {
    const claveHash = hashClave(clave);
    const { rows } = await pool.query(
      'SELECT id, cliente_id, activa, revocada_en FROM api_keys WHERE clave_hash = $1',
      [claveHash]
    );
    const apiKey = rows[0];

    // Mensaje genérico a propósito (mismo criterio que auth.service.js en
    // el login): no distinguimos "no existe" de "revocada" en la respuesta,
    // para no darle información gratis a quien esté probando claves.
    if (!apiKey || !apiKey.activa || apiKey.revocada_en) {
      return res.status(401).json({ error: 'API key inválida o revocada' });
    }

    req.clienteId = apiKey.cliente_id;
    req.apiKeyId = apiKey.id;

    // Fire-and-forget: no bloqueamos la respuesta al consumidor externo
    // por esto, es solo para que el admin vea en la UI si la integración
    // sigue viva. Si falla, no debe tumbar el request real.
    pool.query('UPDATE api_keys SET ultimo_uso = NOW() WHERE id = $1', [apiKey.id])
      .catch((err) => console.error('No se pudo actualizar ultimo_uso de api_keys:', err));

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { verificarApiKey, hashClave };
