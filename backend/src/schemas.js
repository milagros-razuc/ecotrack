const { z } = require('zod');

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  passwordActual: z.string().min(1),
  passwordNueva: z.string().min(6),
});

const dispositivoSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().optional(),
  ubicacion: z.string().optional(),
});

const umbralSchema = z.object({
  dispositivoCodigo: z.string().min(1),
  variable: z.enum(['temperatura', 'humedad', 'luminosidad']),
  umbralMin: z.number(),
  umbralMax: z.number(),
  notificacionesActivas: z.boolean().optional(),
}).refine((data) => data.umbralMin < data.umbralMax, {
  message: 'umbralMin debe ser menor que umbralMax',
  path: ['umbralMin'],
});

// Para PATCH /api/alertas/:id (botón "Gestionar" de Auditoría)
// comentario es opcional: permite dejar una nota al atender o reabrir (RF11).
const actualizarEstadoAlertaSchema = z.object({
  estado: z.enum(['pendiente', 'atendida']),
  comentario: z.string().max(500).optional(),
});

// Para el mensaje MQTT entrante en ecotrack/<codigo>/lecturas (RF04/RNF03).
// Era el único canal de ingesta sin validar: un payload con campos
// faltantes, de tipo incorrecto o fuera de rango físico se descarta antes
// de guardar la lectura. Los rangos son holgados a propósito (más anchos
// que los umbrales configurables) para no bloquear lecturas legítimas de
// climas extremos, solo basura de sensor/transmisión.
const lecturaMqttSchema = z.object({
  temperatura: z.number().min(-40).max(80),
  humedad: z.number().min(0).max(100),
  luminosidad: z.number().min(0).max(100),
});

// Para POST /api/usuarios (alta de usuario, CU09 — RF16)
const crearUsuarioSchema = z.object({
  username: z.string().min(3, 'El username debe tener al menos 3 caracteres'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  nombre: z.string().optional(),
  rol: z.enum(['admin', 'comun']).default('comun'),
});

// Para PATCH /api/usuarios/:id (modificación, CU09 — RF16)
// Se puede mandar nombre y/o rol; al menos uno de los dos.
const actualizarUsuarioSchema = z.object({
  nombre: z.string().optional(),
  rol: z.enum(['admin', 'comun']).optional(),
}).refine((data) => data.nombre !== undefined || data.rol !== undefined, {
  message: 'Debe enviar al menos nombre o rol para actualizar',
});

// Para PATCH /api/auth/me (editar nombre del perfil propio, RF20)
const actualizarPerfilSchema = z.object({
  nombre: z.string().min(1, 'El nombre no puede estar vacío').max(100),
});

// Para POST /api/api-keys (alta de clave de API, RF19/RI20)
const crearApiKeySchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(100, 'El nombre es demasiado largo'),
});

module.exports = {
  loginSchema,
  changePasswordSchema,
  dispositivoSchema,
  umbralSchema,
  actualizarEstadoAlertaSchema,
  crearUsuarioSchema,
  actualizarUsuarioSchema,
  lecturaMqttSchema,
  actualizarPerfilSchema,
  crearApiKeySchema,
};
