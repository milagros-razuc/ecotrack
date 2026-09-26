const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRouter = require('./routes/auth');
const dispositivosRouter = require('./routes/dispositivos');
const lecturasRouter = require('./routes/lecturas');
const alertasRouter = require('./routes/alertas');
const umbralesRouter = require('./routes/umbrales');
const usuariosRouter = require('./routes/usuarios');
const auditoriaRouter = require('./routes/auditoria');
const apiKeysRouter = require('./routes/apiKeys.routes');
const publicRouter = require('./routes/public.routes');
const errorHandler = require('./middleware/errorHandler');
const verificarToken = require('./middleware/auth');
const extraerCliente = require('./middleware/cliente');

const { apiKeyLimiter } = require('./middleware/rateLimiter');
const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(cors());

// Pública: no requiere token. /me y /change-password validan la sesión
app.use('/api/auth', authRouter);

// Protegidas: requieren estar logueado Y tener clienteId en el token
app.use('/api/dispositivos', verificarToken, extraerCliente, dispositivosRouter);
app.use('/api/lecturas', verificarToken, extraerCliente, lecturasRouter);
app.use('/api/alertas', verificarToken, extraerCliente, alertasRouter);
app.use('/api/umbrales', verificarToken, extraerCliente, umbralesRouter);
app.use('/api/usuarios', verificarToken, extraerCliente, usuariosRouter);
app.use('/api/auditoria', verificarToken, extraerCliente, auditoriaRouter);

// Gestión de claves de API (RF19/RI20): se administra logueado en el
// dashboard, igual que el resto — sesión + clienteId del token. La
// restricción a rol admin ya está dentro de apiKeys.routes.js.
app.use('/api/api-keys', verificarToken, extraerCliente, apiKeysRouter);

// API pública de solo lectura (RF19/RI20): a propósito NO lleva
// verificarToken ni extraerCliente. No es tráfico de sesión del
// dashboard, es tráfico externo autenticado con una API key (header
// X-Api-Key) — publicRouter ya trae su propio middleware
// (verificarApiKey) que resuelve req.clienteId a partir de la clave.
app.use('/api/public', apiKeyLimiter, publicRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

// Debe ir al final: middleware de errores
app.use(errorHandler);

module.exports = app;
