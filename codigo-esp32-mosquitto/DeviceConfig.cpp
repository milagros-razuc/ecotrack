#include "DeviceConfig.h"

#include <ctype.h>
#include <Preferences.h>

#include "esp32Secret.h"

namespace {
constexpr char kNamespace[] = "ecotrack";

bool hasControlChars(const String& value) {
  for (size_t i = 0; i < value.length(); ++i) {
    if (static_cast<unsigned char>(value[i]) < 32 || value[i] == 127) return true;
  }
  return false;
}

bool validHost(const String& host) {
  if (host.isEmpty() || host.length() > 253) return false;
  size_t labelLength = 0;
  for (size_t i = 0; i < host.length(); ++i) {
    const char c = host[i];
    if (c == '.') {
      if (labelLength == 0 || host[i - 1] == '-') return false;
      labelLength = 0;
      continue;
    }
    if (!isalnum(static_cast<unsigned char>(c)) && c != '-') return false;
    if (labelLength == 0 && c == '-') return false;
    if (++labelLength > 63) return false;
  }
  return labelLength != 0 && host[host.length() - 1] != '-';
}
}  // namespace

DeviceConfig defaultConfig() {
  return {SECRET_SSID, SECRET_PASS, SECRET_MQTT_HOST, SECRET_DEVICE_ID,
          SECRET_MQTT_USER, SECRET_MQTT_PASS};
}

bool loadSavedConfig(DeviceConfig& config) {
  Preferences prefs;
  if (!prefs.begin(kNamespace, true)) return false;
  const bool saved = prefs.getBool("configured", false);
  if (saved) {
    config.ssid = prefs.getString("ssid", "");
    config.wifiPassword = prefs.getString("wifiPass", "");
    config.mqttHost = prefs.getString("mqttHost", "");
    config.deviceId = prefs.getString("deviceId", "");
    config.mqttUser = prefs.getString("mqttUser", "");
    config.mqttPassword = prefs.getString("mqttPass", "");
  }
  prefs.end();
  return saved;
}

bool saveConfig(const DeviceConfig& config) {
  Preferences prefs;
  if (!prefs.begin(kNamespace, false)) return false;
  // Invalidar antes de escribir: un corte de energia no deja un perfil parcial activo.
  bool ok = prefs.putBool("configured", false) == 1;
  if (ok) {
    prefs.putString("ssid", config.ssid);
    prefs.putString("wifiPass", config.wifiPassword);
    prefs.putString("mqttHost", config.mqttHost);
    prefs.putString("deviceId", config.deviceId);
    prefs.putString("mqttUser", config.mqttUser);
    prefs.putString("mqttPass", config.mqttPassword);
    ok = prefs.getString("ssid", "") == config.ssid
      && prefs.getString("wifiPass", "") == config.wifiPassword
      && prefs.getString("mqttHost", "") == config.mqttHost
      && prefs.getString("deviceId", "") == config.deviceId
      && prefs.getString("mqttUser", "") == config.mqttUser
      && prefs.getString("mqttPass", "") == config.mqttPassword;
  }
  const bool committed = ok && prefs.putBool("configured", true) == 1;
  prefs.end();
  return committed;
}

bool validateConfig(const DeviceConfig& config, String& error) {
  if (config.ssid.isEmpty() || config.ssid.length() > 32 || hasControlChars(config.ssid)) {
    error = "SSID debe tener entre 1 y 32 caracteres, sin controles";
  } else if (config.wifiPassword.length() > 63 ||
             (!config.wifiPassword.isEmpty() && config.wifiPassword.length() < 8) ||
             hasControlChars(config.wifiPassword)) {
    error = "PASS debe estar vacia (red abierta) o tener entre 8 y 63 caracteres";
  } else if (!validHost(config.mqttHost)) {
    error = "MQTT_HOST debe ser un hostname o IPv4 valido";
  } else if (config.deviceId.isEmpty() || config.deviceId.length() > 32) {
    error = "DEVICE_ID debe tener entre 1 y 32 caracteres";
  } else {
    for (size_t i = 0; i < config.deviceId.length(); ++i) {
      const char c = config.deviceId[i];
      if (!isalnum(static_cast<unsigned char>(c)) && c != '-' && c != '_') {
        error = "DEVICE_ID solo admite letras, numeros, - y _";
        return false;
      }
    }
    if (config.mqttUser.isEmpty() || config.mqttUser.length() > 64 || hasControlChars(config.mqttUser)) {
      error = "MQTT_USER debe tener entre 1 y 64 caracteres";
    } else if (config.mqttPassword.isEmpty() || config.mqttPassword.length() > 128 || hasControlChars(config.mqttPassword)) {
      error = "MQTT_PASS debe tener entre 1 y 128 caracteres";
    } else {
      error = "";
      return true;
    }
  }
  return false;
}

bool setConfigField(DeviceConfig& config, const String& field, const String& value, String& error) {
  DeviceConfig candidate = config;
  if (field == "SSID") candidate.ssid = value;
  else if (field == "PASS") candidate.wifiPassword = value;
  else if (field == "MQTT_HOST") candidate.mqttHost = value;
  else if (field == "DEVICE_ID") candidate.deviceId = value;
  else if (field == "MQTT_USER") candidate.mqttUser = value;
  else if (field == "MQTT_PASS") candidate.mqttPassword = value;
  else {
    error = "Campo desconocido";
    return false;
  }

  // Permite completar un perfil inicialmente vacio campo por campo.
  if (value.length() > 253 || hasControlChars(value)) {
    error = "Valor demasiado largo o con caracteres de control";
    return false;
  }
  config = candidate;
  error = "";
  return true;
}
