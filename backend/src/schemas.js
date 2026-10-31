const { z } = require('zod');

const fechaLecturaSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'debe tener formato YYYY-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }, 'debe ser una fecha válida');

const rangoFechasLecturasSchema = z.object({
  fechaDesde: fechaLecturaSchema.optional(),
  fechaHasta: fechaLecturaSchema.optional(),
}).passthrough().superRefine((data, context) => {
  if (!data.fechaDesde || !data.fechaHasta) return;

  const desde = Date.parse(`${data.fechaDesde}T00:00:00Z`);
  const hasta = Date.parse(`${data.fechaHasta}T00:00:00Z`);
  const dias = (hasta - desde) / (24 * 60 * 60 * 1000);

  if (desde > hasta) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fechaHasta'],
      message: 'fechaDesde no puede ser posterior a fechaHasta',
    });
  } else if (dias > 366) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fechaHasta'],
      message: 'El rango de fechas no puede superar los 366 días',
    });
  }
});

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
  token: z.string().min(1),
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
// Cada transición debe conservar una nota propia en el historial inmutable.
const actualizarEstadoAlertaSchema = z.object({
  estado: z.enum(['pendiente', 'atendida']),
  comentario: z.string().trim().min(3).max(500),
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
  ts: z.number().int().nonnegative().optional(),
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
  rangoFechasLecturasSchema,
};
