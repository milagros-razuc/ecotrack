const crypto = require('crypto');
const pool = require('../config/db');
const { hashClave } = require('../middleware/apiKey');

// Genera la clave completa que se le muestra al admin UNA sola vez, más el
// prefijo (sin hashear) que queda visible en la lista para poder
// identificarla después. 32 bytes random en hex = 64 caracteres de
// entropía, con el prefijo "eco_" adelante para que se reconozca de un
// vistazo como clave de EcoTrack (mismo patrón que usan GitHub/Stripe).
//
// prefijo = "eco_" + los primeros 8 hex de la parte random = 12
// caracteres, coincide exacto con el ancho de la columna prefijo VARCHAR(12).
function generarClaveCompleta() {
  const random = crypto.randomBytes(32).toString('hex');
  const clave = `eco_${random}`;
  const prefijo = clave.slice(0, 12);
  return { clave, prefijo };
}

// Crea una clave nueva para el cliente del admin logueado. Devuelve la
// clave en texto plano SOLO en este momento — no se puede volver a
// consultar después, ni siquiera por otro admin del mismo cliente. Si se
// pierde, la única opción es revocarla y generar una nueva.
async function crear({ clienteId, nombre, creadoPor }) {
  const { clave, prefijo } = generarClaveCompleta();
  const claveHash = hashClave(clave);

  const { rows } = await pool.query(
    `INSERT INTO api_keys (cliente_id, nombre, clave_hash, prefijo, creado_por)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, nombre, prefijo, activa, creado_en`,
    [clienteId, nombre, claveHash, prefijo, creadoPor]
  );

  return { apiKey: rows[0], clave };
}

// Listado para la pantalla de gestión de claves. Nunca devuelve clave_hash
// (no hace falta para la UI, y no tiene sentido exponerlo ni hasheado).
async function listar(clienteId) {
  const { rows } = await pool.query(
    `SELECT id, nombre, prefijo, activa, creado_en, ultimo_uso, revocada_en
     FROM api_keys
     WHERE cliente_id = $1
     ORDER BY creado_en DESC`,
    [clienteId]
  );
  return rows;
}

// Revocación inmediata (mitigación de riesgo prevista en 3.6). Acotada a
// cliente_id para que un admin no pueda revocar (ni siquiera a ciegas, por
// id) una clave de otro cliente. AND activa = true evita pisar
// revocada_en si ya estaba revocada.
async function revocar(id, clienteId) {
  const { rows } = await pool.query(
    `UPDATE api_keys
     SET activa = false, revocada_en = NOW()
     WHERE id = $1 AND cliente_id = $2 AND activa = true
     RETURNING id, nombre, prefijo`,
    [id, clienteId]
  );
  return rows[0] || null;
}

module.exports = { crear, listar, revocar };
