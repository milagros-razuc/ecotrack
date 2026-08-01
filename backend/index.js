require('dotenv').config();

const app = require('./src/app');
const inicializarDB = require('./src/config/migrate');
const iniciarMQTT = require('./src/mqtt/client');

const PORT = process.env.PORT || 3000;

async function iniciar() {
  await inicializarDB();
  iniciarMQTT();
  app.listen(PORT, () => console.log(`Backend EcoTrack corriendo en puerto ${PORT}`));
}

iniciar().catch((err) => {
  console.error('Error al iniciar el backend:', err);
  process.exit(1);
});
