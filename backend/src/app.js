const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRouter = require('./routes/auth');
const dispositivosRouter = require('./routes/dispositivos');
const lecturasRouter = require('./routes/lecturas');
const alertasRouter = require('./routes/alertas');
const umbralesRouter = require('./routes/umbrales');
const usuariosRouter = require('./routes/usuarios');
const errorHandler = require('./middleware/errorHandler');
const verificarToken = require('./middleware/auth');
const extraerCliente = require('./middleware/cliente');

const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(cors());

// Pública: no requiere token. /me y /change-password validan la sesión
// puertas adentro del propio router, pero no necesitan clienteId porque
// operan sobre el usuario del token (req.usuario.sub), no sobre datos
// de otros clientes.
app.use('/api/auth', authRouter);

// Protegidas: requieren estar logueado Y tener clienteId en el token
// (extraerCliente rechaza con 401 los tokens viejos sin ese campo).
app.use('/api/dispositivos', verificarToken, extraerCliente, dispositivosRouter);
app.use('/api/lecturas', verificarToken, extraerCliente, lecturasRouter);
app.use('/api/alertas', verificarToken, extraerCliente, alertasRouter);
app.use('/api/umbrales', verificarToken, extraerCliente, umbralesRouter);
app.use('/api/usuarios', verificarToken, extraerCliente, usuariosRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

// Debe ir al final: middleware de errores
app.use(errorHandler);

module.exports = app;
