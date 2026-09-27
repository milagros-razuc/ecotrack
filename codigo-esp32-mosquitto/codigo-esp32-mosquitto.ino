#include <DHT.h>
#include <PubSubClient.h>
#include <WiFi.h>

#include "DeviceConfig.h"
#include "SetupPortal.h"
#include "esp32Secret.h"

#define DHTPIN 4
#define DHTTYPE DHT11
#define LDRPIN 34
#define BOOT_PIN 0

#ifndef INTERVALO_CAPTURA_MS
#define INTERVALO_CAPTURA_MS 10000
#endif

constexpr unsigned long kWifiTimeoutMs = 15000;
constexpr unsigned long kMqttRetryMs = 3000;
constexpr unsigned long kWifiRetryMs = 5000;
constexpr unsigned long kReadyDisplayMs = 8000;
constexpr unsigned long kBootHoldMs = 3000;
constexpr unsigned long kOfflinePortalMs = 60000;
constexpr unsigned long kInitialMqttTimeoutMs = 20000;
constexpr uint16_t kMqttPort = 1883;

enum class Mode { provisioning, connectingWifi, verifyingMqtt, readyDisplay, running };

DeviceConfig config;
Mode mode = Mode::provisioning;
DHT dht(DHTPIN, DHTTYPE);
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
String apName;
bool configNeedsSave = true;
bool bootActionConsumed = false;
unsigned long bootPressedAt = 0;
unsigned long wifiStartedAt = 0;
unsigned long mqttVerifyStartedAt = 0;
unsigned long readySince = 0;
unsigned long lastWifiRetryAt = 0;
unsigned long lastMqttRetryAt = 0;
unsigned long lastCaptureAt = 0;
unsigned long wifiLostAt = 0;

void beginWifi();

void enterProvisioning() {
  if (mqtt.connected()) mqtt.disconnect();
  mode = Mode::provisioning;
  if (startSetupPortal(apName, config, beginWifi)) {
    setupPortalStatus("READY");
    Serial.println("Red de configuracion: " + apName);
    Serial.println("Abrir http://192.168.4.1/ desde esa red");
  } else {
    Serial.println("No se pudo iniciar la red de configuracion");
  }
}

void beginWifi() {
  if (setupPortalActive()) configNeedsSave = true;
  if (mqtt.connected()) mqtt.disconnect();
  WiFi.mode(setupPortalActive() ? WIFI_AP_STA : WIFI_STA);
  WiFi.disconnect();
  WiFi.begin(config.ssid.c_str(), config.wifiPassword.c_str());
  wifiStartedAt = millis();
  mode = Mode::connectingWifi;
  setupPortalStatus("WIFI_CONNECTING");
  Serial.println("Probando WiFi...");
}

void pollConnectingWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    mqtt.setServer(config.mqttHost.c_str(), kMqttPort);
    lastMqttRetryAt = 0;
    mqttVerifyStartedAt = millis();
    mode = Mode::verifyingMqtt;
    setupPortalStatus("MQTT_CONNECTING");
    Serial.println("WiFi conectado. Probando MQTT...");
  } else if (millis() - wifiStartedAt >= kWifiTimeoutMs) {
    WiFi.disconnect();
    enterProvisioning();
    setupPortalStatus("WIFI_FAIL");
    Serial.println("WiFi no conecto; revisar datos en el formulario");
  }
}

void pollVerifyingMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    enterProvisioning();
    setupPortalStatus("WIFI_FAIL");
    return;
  }
  if (lastMqttRetryAt != 0 && millis() - lastMqttRetryAt < kMqttRetryMs) return;
  lastMqttRetryAt = millis();
  if (!mqtt.connect(config.deviceId.c_str(), config.mqttUser.c_str(), config.mqttPassword.c_str())) {
    const int mqttState = mqtt.state();
    if (!setupPortalActive() && millis() - mqttVerifyStartedAt >= kInitialMqttTimeoutMs) {
      enterProvisioning();
    }
    setupPortalStatus("MQTT_FAIL:" + String(mqttState));
    Serial.printf("No se pudo conectar a MQTT (codigo %d)\n", mqttState);
    return;
  }
  if (configNeedsSave && !saveConfig(config)) {
    mqtt.disconnect();
    enterProvisioning();
    setupPortalStatus("ERR_SAVE");
    Serial.println("No se pudo guardar el perfil");
    return;
  }
  configNeedsSave = false;
  readySince = millis();
  mode = Mode::readyDisplay;
  setupPortalStatus("READY:" + WiFi.localIP().toString());
  Serial.println("WiFi y MQTT confirmados. IP: " + WiFi.localIP().toString());
}

void pollReadyDisplay() {
  if (WiFi.status() != WL_CONNECTED) {
    enterProvisioning();
    setupPortalStatus("WIFI_FAIL");
    return;
  }
  if (!mqtt.connected()) {
    mode = Mode::verifyingMqtt;
    setupPortalStatus("MQTT_CONNECTING");
    return;
  }
  mqtt.loop();
  if (millis() - readySince < kReadyDisplayMs) return;
  stopSetupPortal();
  WiFi.mode(WIFI_STA);
  mode = Mode::running;
  Serial.println("Iniciando lecturas y publicacion MQTT");
}

void reconnectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiLostAt = 0;
    return;
  }
  if (mqtt.connected()) mqtt.disconnect();
  if (wifiLostAt == 0) wifiLostAt = millis();
  if (millis() - wifiLostAt >= kOfflinePortalMs) {
    enterProvisioning();
    setupPortalStatus("WIFI_FAIL");
    return;
  }
  if (lastWifiRetryAt == 0 || millis() - lastWifiRetryAt >= kWifiRetryMs) {
    lastWifiRetryAt = millis();
    WiFi.reconnect();
    Serial.println("Reintentando WiFi...");
  }
}

void reconnectMqtt() {
  if (mqtt.connected()) return;
  if (lastMqttRetryAt != 0 && millis() - lastMqttRetryAt < kMqttRetryMs) return;
  lastMqttRetryAt = millis();
  if (mqtt.connect(config.deviceId.c_str(), config.mqttUser.c_str(), config.mqttPassword.c_str())) {
    Serial.println("MQTT reconectado");
  } else {
    Serial.printf("MQTT fallo (codigo %d); reintentando\n", mqtt.state());
  }
}

void publishReading() {
  if (lastCaptureAt != 0 && millis() - lastCaptureAt < INTERVALO_CAPTURA_MS) return;
  lastCaptureAt = millis();
  const float temperatura = dht.readTemperature();
  const float humedad = dht.readHumidity();
  const int luz = map(analogRead(LDRPIN), 0, 4095, 0, 100);
  if (isnan(temperatura) || isnan(humedad)) {
    Serial.println("Error leyendo DHT11");
    return;
  }
  String payload = "{\"temperatura\":" + String(temperatura, 1);
  payload += ",\"humedad\":" + String(humedad, 1);
  payload += ",\"luminosidad\":" + String(luz) + "}";
  const String topic = "ecotrack/" + config.deviceId + "/lecturas";
  if (mqtt.publish(topic.c_str(), payload.c_str())) {
    Serial.println("Publicado en " + topic + ": " + payload);
  } else {
    Serial.println("No se pudo publicar la lectura");
  }
}

void pollBootButton() {
  if (digitalRead(BOOT_PIN) != LOW) {
    bootPressedAt = 0;
    bootActionConsumed = false;
    return;
  }
  if (bootPressedAt == 0) bootPressedAt = millis();
  if (!bootActionConsumed && millis() - bootPressedAt >= kBootHoldMs && mode == Mode::running) {
    bootActionConsumed = true;
    enterProvisioning();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BOOT_PIN, INPUT_PULLUP);
  pinMode(DHTPIN, INPUT_PULLUP);
  dht.begin();
  mqtt.setSocketTimeout(3);
  config = defaultConfig();
  const bool saved = loadSavedConfig(config);
  configNeedsSave = !saved;
  const String suffix = String(static_cast<uint32_t>(ESP.getEfuseMac()), HEX);
  apName = "EcoTrack-Setup-" + suffix;
  String error;
  if (saved && validateConfig(config, error)) {
    beginWifi();
  } else {
    enterProvisioning();
  }
}

void loop() {
  pollSetupPortal();
  pollBootButton();
  switch (mode) {
    case Mode::provisioning: break;
    case Mode::connectingWifi: pollConnectingWifi(); break;
    case Mode::verifyingMqtt: pollVerifyingMqtt(); break;
    case Mode::readyDisplay: pollReadyDisplay(); break;
    case Mode::running:
      reconnectWifi();
      if (mode == Mode::running && WiFi.status() == WL_CONNECTED) {
        reconnectMqtt();
        if (mqtt.connected()) {
          mqtt.loop();
          publishReading();
        }
      }
      break;
  }
  delay(10);
}
