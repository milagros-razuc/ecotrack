#include <DHT.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include "esp32Secret.h"

#define DHTPIN 4
#define DHTTYPE DHT11
#define LDRPIN 34

// RF02: intervalo de captura configurable. Se puede sobreescribir
// definiéndolo en esp32Secret.h (junto con el resto de la config del
// dispositivo) o pasándolo como build flag (-DINTERVALO_CAPTURA_MS=5000).
// Si no se define en ningún lado, se mantiene en 10s como antes.
#ifndef INTERVALO_CAPTURA_MS
#define INTERVALO_CAPTURA_MS 10000
#endif

const char* ssid       = SECRET_SSID;
const char* password   = SECRET_PASS;
const char* mqttServer = SECRET_MQTT_HOST;
const int   mqttPort   = 1883;
const char* deviceId   = SECRET_DEVICE_ID;
const char* mqttUser   = SECRET_MQTT_USER;
const char* mqttPass   = SECRET_MQTT_PASS;

DHT dht(DHTPIN, DHTTYPE);
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

void conectarWifi() {
  WiFi.begin(ssid, password);
  Serial.print("Conectando WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConectado! IP: " + WiFi.localIP().toString());
}

void conectarMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Conectando MQTT...");
    if (mqtt.connect(deviceId, mqttUser, mqttPass)) {
      Serial.println("conectado!");
    } else {
      Serial.print("fallo, codigo: ");
      Serial.print(mqtt.state());
      Serial.println(" - reintentando en 3s");
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(DHTPIN, INPUT_PULLUP);
  delay(2000);
  dht.begin();
  conectarWifi();
  mqtt.setServer(mqttServer, mqttPort);
}

void loop() {
  if (!mqtt.connected()) conectarMQTT();
  mqtt.loop();

  float temperatura = dht.readTemperature();
  float humedad     = dht.readHumidity();
  int luz           = map(analogRead(LDRPIN), 0, 4095, 0, 100);

  if (isnan(temperatura) || isnan(humedad)) {
    Serial.println("Error leyendo DHT11");
    delay(3000);
    return;
  }

  // Armar JSON
  String payload = "{";
  payload += "\"temperatura\":" + String(temperatura, 1) + ",";
  payload += "\"humedad\":"     + String(humedad, 1)     + ",";
  payload += "\"luminosidad\":" + String(luz);
  payload += "}";

  // Topic: ecotrack/<deviceId>/lecturas
  String topic = "ecotrack/" + String(deviceId) + "/lecturas";

  mqtt.publish(topic.c_str(), payload.c_str());
  Serial.println("Publicado en " + topic + ": " + payload);

  delay(INTERVALO_CAPTURA_MS);
}
