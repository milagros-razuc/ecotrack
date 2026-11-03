#pragma once

#include <Arduino.h>

struct DeviceConfig {
  String ssid;
  String wifiPassword;
  String mqttHost;
  uint16_t mqttPort = 8883;
  String serverHost;
  String deviceId;
  String mqttUser;
  String mqttPassword;
  String softApPassword;
  String setupPin;
  String deviceSecret;
  bool mqttEnrolled = false;
};

DeviceConfig defaultConfig();
bool loadFactoryIdentity(DeviceConfig& config, String& error);
bool loadSavedConfig(DeviceConfig& config);
bool saveConfig(const DeviceConfig& config);
bool validateConfig(const DeviceConfig& config, String& error);
bool setConfigField(DeviceConfig& config, const String& field, const String& value, String& error);
