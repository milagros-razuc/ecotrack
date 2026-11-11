#include "EnrollmentClient.h"

#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include "enroll_ca.h"

#if __has_include("enrollment_port.local.h")
#include "enrollment_port.local.h"
#endif

namespace {
constexpr unsigned long kEnrollmentBaseBackoffMs = 90000;
constexpr unsigned long kEnrollmentMaxBackoffMs = 900000;
#ifndef ECOTRACK_ENROLLMENT_PORT
#define ECOTRACK_ENROLLMENT_PORT 443
#endif
constexpr uint16_t kEnrollmentPort = ECOTRACK_ENROLLMENT_PORT;

String jsonString(const String& body, const char* key) {
  const String marker = "\"" + String(key) + "\":\"";
  const int start = body.indexOf(marker);
  if (start < 0) return "";
  const int valueStart = start + marker.length();
  const int valueEnd = body.indexOf('"', valueStart);
  if (valueEnd < 0) return "";
  return body.substring(valueStart, valueEnd);
}

int jsonNumber(const String& body, const char* key) {
  const String marker = "\"" + String(key) + "\":";
  const int start = body.indexOf(marker);
  if (start < 0) return -1;
  const int valueStart = start + marker.length();
  const int valueEnd = body.indexOf(',', valueStart);
  const int end = valueEnd < 0 ? body.indexOf('}', valueStart) : valueEnd;
  if (end < 0) return -1;
  return body.substring(valueStart, end).toInt();
}

String jsonEscape(const String& value) {
  String escaped;
  escaped.reserve(value.length());
  for (size_t index = 0; index < value.length(); ++index) {
    const char character = value[index];
    if (character == '"' || character == '\\') escaped += '\\';
    escaped += character;
  }
  return escaped;
}
}  // namespace

bool parseEnrollmentResponse(const String& body, EnrollmentResponse& response) {
  response.mqttUser = jsonString(body, "mqtt_user");
  response.mqttPassword = jsonString(body, "mqtt_pass");
  response.mqttHost = jsonString(body, "mqtt_host");
  const int port = jsonNumber(body, "mqtt_port");
  if (response.mqttUser.isEmpty() || response.mqttPassword.isEmpty() ||
      response.mqttHost.isEmpty() || port < 1 || port > 65535) {
    return false;
  }
  response.mqttPort = static_cast<uint16_t>(port);
  return true;
}

EnrollmentResult enrollDevice(const DeviceConfig& config,
                              EnrollmentResponse& response) {
  WiFiClientSecure client;
  client.setCACert(kEnrollCa);
  HTTPClient http;
  const String url = "https://" + config.serverHost + ":" +
                     String(kEnrollmentPort) + "/api/dispositivos/enrolar";
  if (!http.begin(client, url)) return EnrollmentResult::retry;
  http.addHeader("Content-Type", "application/json");
  const String body = buildEnrollmentRequest(config);
  const int status = http.POST(body);
  if (status != 200) {
    http.end();
    return EnrollmentResult::retry;
  }
  const String responseBody = http.getString();
  http.end();
  return parseEnrollmentResponse(responseBody, response)
      ? EnrollmentResult::success
      : EnrollmentResult::retry;
}

String buildEnrollmentRequest(const DeviceConfig& config) {
  return "{\"device_id\":\"" + jsonEscape(config.deviceId) +
         "\",\"device_secret\":\"" + jsonEscape(config.deviceSecret) + "\"}";
}

unsigned long enrollmentBackoffMs(uint8_t attempt, uint16_t jitterMs) {
  unsigned long delayMs = kEnrollmentBaseBackoffMs;
  for (uint8_t index = 1; index < attempt && delayMs < kEnrollmentMaxBackoffMs; ++index) {
    delayMs = min(delayMs * 2, kEnrollmentMaxBackoffMs);
  }
  return min(delayMs + jitterMs, kEnrollmentMaxBackoffMs);
}
