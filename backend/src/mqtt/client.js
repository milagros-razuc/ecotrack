const mqtt = require('mqtt');
const dispositivosService = require('../services/dispositivos.service');
const lecturasService = require('../services/lecturas.service');
const umbralesService = require('../services/umbrales.service');
const alertasService = require('../services/alertas.service');

// Compara una lectura contra su umbral configurado y, si está fuera de
// rango, registra una alerta. Si no hay umbral definido para esa variable
// en ese dispositivo, no hace nada. Si el umbral existe pero tiene las
// notificaciones desactivadas (toggle de Configuración), tampoco genera
// alerta, aunque el valor esté fuera de rango.
async function evaluarUmbral(dispositivoCodigo, variable, valor) {
  if (valor === undefined || valor === null) return;

  const umbral = await umbralesService.obtener(dispositivoCodigo, variable);
  if (!umbral) return;
  if (umbral.notificaciones_activas === false) return;

  const fueraDeRango = valor < umbral.umbral_min || valor > umbral.umbral_max;
  if (fueraDeRango) {
    await alertasService.registrar({
      dispositivoCodigo,
      variable,
      valor,
      umbralMin: umbral.umbral_min,
      umbralMax: umbral.umbral_max,
    });
    console.log(`Alerta: ${dispositivoCodigo} ${variable}=${valor} fuera de rango [${umbral.umbral_min}, ${umbral.umbral_max}]`);
  }
}

function iniciarMQTT() {
  const mqttClient = mqtt.connect(`mqtt://${process.env.MQTT_HOST}:${process.env.MQTT_PORT}`, {
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS,
  });

  mqttClient.on('connect', () => {
    console.log('Conectado a Mosquitto');
    mqttClient.subscribe('ecotrack/+/lecturas', (err) => {
      if (!err) console.log('Suscrito a ecotrack/+/lecturas');
    });
  });

  mqttClient.on('message', async (topic, message) => {
    try {
      const dispositivoCodigo = topic.split('/')[1];
      const data = JSON.parse(message.toString());

      await dispositivosService.registrarConexion(dispositivoCodigo);

      await lecturasService.guardar({
        dispositivoCodigo,
        temperatura: data.temperatura,
        humedad: data.humedad,
        luminosidad: data.luminosidad,
      });

      console.log(`Lectura guardada de ${dispositivoCodigo}:`, data);

      await Promise.all([
        evaluarUmbral(dispositivoCodigo, 'temperatura', data.temperatura),
        evaluarUmbral(dispositivoCodigo, 'humedad', data.humedad),
        evaluarUmbral(dispositivoCodigo, 'luminosidad', data.luminosidad),
      ]);
    } catch (err) {
      console.error('Error procesando mensaje MQTT:', err.message);
    }
  });

  mqttClient.on('error', (err) => {
    console.error('Error de conexión MQTT:', err.message);
  });

  return mqttClient;
}

module.exports = iniciarMQTT;