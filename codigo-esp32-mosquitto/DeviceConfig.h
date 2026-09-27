#pragma once

#include <Arduino.h>

struct DeviceConfig {
  String ssid;
  String wifiPassword;
  String mqttHost;
  String deviceId;
  String mqttUser;
  String mqttPassword;
};

// Los valores del header son los iniciales. Un perfil confirmado por WiFi
// queda guardado en NVS y tiene prioridad en los siguientes arranques.
DeviceConfig defaultConfig();
bool loadSavedConfig(DeviceConfig& config);
bool saveConfig(const DeviceConfig& config);
bool validateConfig(const DeviceConfig& config, String& error);
bool setConfigField(DeviceConfig& config, const String& field, const String& value, String& error);
