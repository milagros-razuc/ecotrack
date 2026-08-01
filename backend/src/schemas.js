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
const actualizarEstadoAlertaSchema = z.object({
  estado: z.enum(['pendiente', 'atendida']),
});

module.exports = {
  loginSchema,
  changePasswordSchema,
  dispositivoSchema,
  umbralSchema,
  actualizarEstadoAlertaSchema,
};