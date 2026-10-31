#pragma once

#include <Arduino.h>

struct DeviceConfig {
  String ssid;
  String wifiPassword;
  String mqttHost;
  String serverHost;
  String deviceId;
  String mqttUser;
  String mqttPassword;
  String softApPassword;
  String setupPin;
  String deviceSecret;
};

DeviceConfig defaultConfig();
bool loadFactoryIdentity(DeviceConfig& config, String& error);
bool loadSavedConfig(DeviceConfig& config);
bool saveConfig(const DeviceConfig& config);
bool validateConfig(const DeviceConfig& config, String& error);
bool setConfigField(DeviceConfig& config, const String& field, const String& value, String& error);
