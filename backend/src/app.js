const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRouter = require('./routes/auth');
const dispositivosRouter = require('./routes/dispositivos');
const lecturasRouter = require('./routes/lecturas');
const alertasRouter = require('./routes/alertas');
const umbralesRouter = require('./routes/umbrales');
const errorHandler = require('./middleware/errorHandler');
const verificarToken = require('./middleware/auth');

const app = express();

app.use(morgan('dev'));
app.use(express.json());
app.use(cors());

// Pública: no requiere token
app.use('/api/auth', authRouter);

// Protegidas: requieren estar logueado
app.use('/api/dispositivos', verificarToken, dispositivosRouter);
app.use('/api/lecturas', verificarToken, lecturasRouter);
app.use('/api/alertas', verificarToken, alertasRouter);
app.use('/api/umbrales', verificarToken, umbralesRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

// Debe ir al final: middleware de errores
app.use(errorHandler);

module.exports = app;
