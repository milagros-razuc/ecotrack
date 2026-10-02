const mqtt = require('mqtt');
const dispositivosService = require('../services/dispositivos.service');
const lecturasService = require('../services/lecturas.service');
const umbralesService = require('../services/umbrales.service');
const alertasService = require('../services/alertas.service');
const { lecturaMqttSchema } = require('../schemas');
const { clientRoom } = require('../realtime/socketRegistry');

async function evaluarUmbral(io, dispositivoCodigo, variable, valor, clienteId) {
  if (valor === undefined || valor === null) return;
  const umbral = await umbralesService.obtener(dispositivoCodigo, variable);
  if (!umbral) return;
  if (umbral.notificaciones_activas === false) return;

  const fueraDeRango = valor < umbral.umbral_min || valor > umbral.umbral_max;
  if (fueraDeRango) {
    const alerta = await alertasService.registrar({
      dispositivoCodigo,
      variable,
      valor,
      umbralMin: umbral.umbral_min,
      umbralMax: umbral.umbral_max,
    });

    console.log(`Alerta: ${dispositivoCodigo} ${variable}=${valor} fuera de rango [${umbral.umbral_min}, ${umbral.umbral_max}]`);

    if (clienteId === null || clienteId === undefined) return;

    io.to(clientRoom(clienteId)).emit('alerta', {
      dispositivoCodigo,
      variable,
      valor,
      umbralMin: umbral.umbral_min,
      umbralMax: umbral.umbral_max,
      timestamp: new Date().toISOString()
    });
  }
}

function iniciarMQTT(io) {
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

  mqttClient.on('message', (topic, message) => {
    procesarMensaje(io, topic, message);
  });

  mqttClient.on('error', (err) => {
    console.error('Error de conexión MQTT:', err.message);
  });

  return mqttClient;
}

async function procesarMensaje(io, topic, message) {
    try {
      const dispositivoCodigo = topic.split('/')[1];

      let dataCruda;
      try {
        dataCruda = JSON.parse(message.toString());
      } catch (err) {
        console.error(`Mensaje MQTT descartado de ${dispositivoCodigo}: no es JSON válido`);
        return;
      }

      // RF04/RNF03: único canal de ingesta que llegaba sin validar. Un
      // payload con campos faltantes, de tipo incorrecto o fuera de rango
      // físico se descarta acá, antes de tocar dispositivos/lecturas.
      const resultado = lecturaMqttSchema.safeParse(dataCruda);
      if (!resultado.success) {
        const detalle = resultado.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        console.error(`Mensaje MQTT descartado de ${dispositivoCodigo}: ${detalle}`);
        return;
      }
      const data = resultado.data;

      // Si el dispositivo fue dado de baja (activo = false), se descarta
      // el mensaje antes de tocar lecturas/alertas. 
      const activo = await dispositivosService.estaActivo(dispositivoCodigo);
      if (activo === false) {
        console.log(`Mensaje MQTT descartado: ${dispositivoCodigo} está dado de baja`);
        return;
      }

      await dispositivosService.registrarConexion(dispositivoCodigo);
      let clienteId = null;
      try {
        clienteId = await dispositivosService.obtenerClienteId(dispositivoCodigo);
      } catch (err) {
        console.error(`No se pudo resolver el cliente de ${dispositivoCodigo}:`, err.message);
      }
      await lecturasService.guardar({
        dispositivoCodigo,
        temperatura: data.temperatura,
        humedad: data.humedad,
        luminosidad: data.luminosidad,
      });

      console.log(`Lectura guardada de ${dispositivoCodigo}:`, data);

      if (clienteId !== null && clienteId !== undefined) {
        io.to(clientRoom(clienteId)).emit('lectura', {
          dispositivoCodigo,
          ...data,
          timestamp: new Date().toISOString()
        });
      }

      await Promise.all([
        evaluarUmbral(io, dispositivoCodigo, 'temperatura', data.temperatura, clienteId),
        evaluarUmbral(io, dispositivoCodigo, 'humedad', data.humedad, clienteId),
        evaluarUmbral(io, dispositivoCodigo, 'luminosidad', data.luminosidad, clienteId),
      ]);
    } catch (err) {
      console.error('Error procesando mensaje MQTT:', err.message);
    }
}

module.exports = iniciarMQTT;
module.exports.procesarMensaje = procesarMensaje;
