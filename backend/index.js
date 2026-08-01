require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const inicializarDB = require('./src/config/migrate');
const iniciarMQTT = require('./src/mqtt/client');

const PORT = process.env.PORT || 3000;

async function iniciar() {
  await inicializarDB();

  // Crear servidor HTTP y socket.io sobre el mismo puerto
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  io.on('connection', (socket) => {
    console.log('Cliente WebSocket conectado:', socket.id);
    socket.on('disconnect', () => {
      console.log('Cliente WebSocket desconectado:', socket.id);
    });
  });

  // Pasar io al MQTT para que pueda emitir eventos
  iniciarMQTT(io);

  server.listen(PORT, () => console.log(`Backend EcoTrack corriendo en puerto ${PORT}`));
}

iniciar().catch((err) => {
  console.error('Error al iniciar el backend:', err);
  process.exit(1);
});