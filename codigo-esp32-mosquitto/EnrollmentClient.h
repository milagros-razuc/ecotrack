#pragma once

#include <Arduino.h>

#include "DeviceConfig.h"

struct EnrollmentResponse {
  String mqttUser;
  String mqttPassword;
  String mqttHost;
  uint16_t mqttPort = 0;
};

enum class EnrollmentResult {
  success,
  retry,
};

bool parseEnrollmentResponse(const String& body, EnrollmentResponse& response);
String buildEnrollmentRequest(const DeviceConfig& config);
EnrollmentResult enrollDevice(const DeviceConfig& config,
                              EnrollmentResponse& response);
unsigned long enrollmentBackoffMs(uint8_t attempt, uint16_t jitterMs);
