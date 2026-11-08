#include "DeviceConfig.h"

#include <ctype.h>
#include <Preferences.h>

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
  return {};
}

bool loadFactoryIdentity(DeviceConfig& config, String& error) {
  Preferences prefs;
  if (!prefs.begin(kNamespace, true)) {
    error = "No se pudo abrir la identidad de fabrica";
    return false;
  }
  const bool ready = prefs.getBool("factoryReady", false);
  config.deviceId = prefs.getString("deviceId", "");
  config.serverHost = prefs.getString("serverHost", "");
  config.deviceSecret = prefs.getString("deviceSecret", "");
  prefs.end();

  if (!ready || config.deviceId.isEmpty() ||
      !validHost(config.serverHost) || config.deviceSecret.isEmpty()) {
    error = "Identidad de fabrica incompleta";
    return false;
  }
  error = "";
  return true;
}

bool loadSavedConfig(DeviceConfig& config) {
  Preferences prefs;
  if (!prefs.begin(kNamespace, true)) return false;
  const bool saved = prefs.getBool("configured", false);
  if (saved) {
    config.ssid = prefs.getString("ssid", "");
    config.wifiPassword = prefs.getString("wifiPass", "");
    config.mqttHost = prefs.getString("mqttHost", "");
    config.mqttUser = prefs.getString("mqttUser", "");
    config.mqttPassword = prefs.getString("mqttPass", "");
    config.mqttPort = prefs.getUShort("mqttPort", 8883);
    config.mqttEnrolled = prefs.getBool("mqttEnrolled", false);
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
    prefs.putBool("mqttEnrolled", false);
    prefs.putString("ssid", config.ssid);
    prefs.putString("wifiPass", config.wifiPassword);
    prefs.putString("serverHost", config.serverHost);
    prefs.putString("deviceId", config.deviceId);
    prefs.putString("mqttHost", config.mqttHost);
    prefs.putString("mqttUser", config.mqttUser);
    prefs.putString("mqttPass", config.mqttPassword);
    prefs.putUShort("mqttPort", config.mqttPort);
    ok = prefs.getString("ssid", "") == config.ssid
      && prefs.getString("wifiPass", "") == config.wifiPassword
      && prefs.getString("serverHost", "") == config.serverHost
      && prefs.getString("deviceId", "") == config.deviceId;
    ok = ok
      && prefs.getString("mqttHost", "") == config.mqttHost
      && prefs.getString("mqttUser", "") == config.mqttUser
      && prefs.getString("mqttPass", "") == config.mqttPassword
      && prefs.getUShort("mqttPort", 8883) == config.mqttPort;
  }
  const bool committed = ok
      && prefs.putBool("mqttEnrolled", config.mqttEnrolled) == 1
      && prefs.putBool("configured", true) == 1;
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
  } else if (!validHost(config.serverHost)) {
    error = "SERVER_HOST debe ser un hostname o IPv4 valido";
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
#ifdef ECOTRACK_DEV_PORTAL
    if (config.mqttUser.isEmpty() || config.mqttUser.length() > 64 || hasControlChars(config.mqttUser)) {
      error = "MQTT_USER debe tener entre 1 y 64 caracteres";
    } else if (config.mqttPassword.isEmpty() || config.mqttPassword.length() > 128 || hasControlChars(config.mqttPassword)) {
      error = "MQTT_PASS debe tener entre 1 y 128 caracteres";
    } else {
      error = "";
      return true;
    }
#else
    error = "";
    return true;
#endif
  }
  return false;
}

bool setConfigField(DeviceConfig& config, const String& field, const String& value, String& error) {
  DeviceConfig candidate = config;
  if (field == "SSID") candidate.ssid = value;
  else if (field == "PASS") candidate.wifiPassword = value;
#ifdef ECOTRACK_DEV_PORTAL
  else if (field == "MQTT_HOST") candidate.mqttHost = value;
  else if (field == "DEVICE_ID") candidate.deviceId = value;
  else if (field == "MQTT_USER") candidate.mqttUser = value;
  else if (field == "MQTT_PASS") candidate.mqttPassword = value;
#else
  else if (field == "DEVICE_ID") candidate.deviceId = value;
#endif
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

bool loadMqttRecoveryState(MqttRecoveryState& state) {
  Preferences prefs;
  if (!prefs.begin(kNamespace, true)) return false;
  state.authRejectCount = prefs.getUInt("mqtt_rej_count", 0);
  state.reenrollHourCount = prefs.getUInt("mqtt_rn_hcount", 0);
  state.reenrollWindowStart = prefs.getLong64("mqtt_rn_wstart", 0);
  state.lastRejectEpoch = prefs.getLong64("mqtt_rej_last", 0);
  prefs.end();
  return true;
}

bool saveMqttRecoveryState(const MqttRecoveryState& state) {
  Preferences prefs;
  if (!prefs.begin(kNamespace, false)) return false;
  const bool ok =
      prefs.putUInt("mqtt_rej_count", state.authRejectCount) > 0 &&
      prefs.putUInt("mqtt_rn_hcount", state.reenrollHourCount) > 0 &&
      prefs.putLong64("mqtt_rn_wstart", state.reenrollWindowStart) > 0 &&
      prefs.putLong64("mqtt_rej_last", state.lastRejectEpoch) > 0;
  prefs.end();
  return ok;
}
