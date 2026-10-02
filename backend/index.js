require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const inicializarDB = require('./src/config/migrate');
const iniciarMQTT = require('./src/mqtt/client');
const { validarToken } = require('./src/middleware/auth');
const { createSocketRegistry } = require('./src/realtime/socketRegistry');

const PORT = process.env.PORT || 3000;

function crearServidor({ iniciarMqtt = true } = {}) {
  // Crear servidor HTTP y socket.io sobre el mismo puerto
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });
  const socketRegistry = createSocketRegistry();

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = await validarToken(token);
      socket.data.usuario = payload;
      next();
    } catch (err) {
      const authError = new Error('Error de autenticación');
      authError.data = { code: 'AUTHENTICATION_ERROR' };
      next(authError);
    }
  });

  io.on('connection', (socket) => {
    const { sub: userId, clienteId } = socket.data.usuario;
    socketRegistry.register(socket, { userId, clienteId });
    console.log('Cliente WebSocket conectado:', socket.id);
    socket.on('disconnect', () => {
      socketRegistry.unregister(socket);
      console.log('Cliente WebSocket desconectado:', socket.id);
    });
  });

  // Pasar io al MQTT para que pueda emitir eventos
  const mqttClient = iniciarMqtt ? iniciarMQTT(io) : null;
  return { server, io, mqttClient, socketRegistry };
}

async function iniciar({ port = PORT, inicializarBase = true, iniciarMqtt = true } = {}) {
  if (inicializarBase) await inicializarDB();

  const instancia = crearServidor({ iniciarMqtt });
  await new Promise((resolve) => instancia.server.listen(port, resolve));
  console.log(`Backend EcoTrack corriendo en puerto ${port}`);
  return instancia;
}

if (require.main === module) {
  iniciar().catch((err) => {
    console.error('Error al iniciar el backend:', err);
    process.exit(1);
  });
}

module.exports = { crearServidor, iniciar };