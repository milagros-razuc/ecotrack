#pragma once

#include <stdint.h>
#include <time.h>

#include <string>

constexpr uint32_t MQTT_AUTH_REJECT_THRESHOLD = 3;
constexpr uint32_t MQTT_REENROLL_MAX_PER_HOUR = 3;
constexpr uint32_t MQTT_AUTH_REJECT_INTERVAL_SECONDS = 30;
constexpr uint32_t MQTT_REENROLL_WINDOW_SECONDS = 3600;
constexpr const char* MQTT_AUTH_REJECT_THRESHOLD_NAME = "MQTT_AUTH_REJECT_THRESHOLD";
constexpr const char* MQTT_REENROLL_MAX_PER_HOUR_NAME = "MQTT_REENROLL_MAX_PER_HOUR";

struct MqttRecoveryState {
  uint32_t authRejectCount = 0;
  uint32_t reenrollHourCount = 0;
  time_t reenrollWindowStart = 0;
  // Persistido para conservar el intervalo mínimo después de un reinicio.
  time_t lastRejectEpoch = 0;
};

class FirmwareRecoveryPolicy {
 public:
  explicit FirmwareRecoveryPolicy(MqttRecoveryState& state) : state_(state) {}

  bool recordAuthReject(time_t now, bool validTime) {
    if (!validTime || now <= 0 ||
        (state_.lastRejectEpoch != 0 &&
         now - state_.lastRejectEpoch < MQTT_AUTH_REJECT_INTERVAL_SECONDS)) {
      return false;
    }
    state_.lastRejectEpoch = now;
    ++state_.authRejectCount;
    return state_.authRejectCount >= MQTT_AUTH_REJECT_THRESHOLD;
  }

  bool canReenroll(time_t now, bool validTime) {
    if (!validTime || now <= 0) return false;
    if (state_.reenrollWindowStart == 0 ||
        state_.reenrollWindowStart > now ||
        now - state_.reenrollWindowStart >= MQTT_REENROLL_WINDOW_SECONDS) {
      state_.reenrollWindowStart = now;
      state_.reenrollHourCount = 0;
    }
    return state_.reenrollHourCount < MQTT_REENROLL_MAX_PER_HOUR;
  }

  bool recordReenrollment(time_t now, bool validTime) {
    if (!canReenroll(now, validTime)) return false;
    ++state_.reenrollHourCount;
    return true;
  }

  void onMqttConnected() {
    state_.authRejectCount = 0;
    state_.lastRejectEpoch = 0;
  }

  void onReenrollmentSucceeded() {
    state_.authRejectCount = 0;
    state_.lastRejectEpoch = 0;
  }

  void onNonConclusiveEvent() {
    state_.authRejectCount = 0;
    state_.lastRejectEpoch = 0;
  }

  uint32_t rejectCount() const { return state_.authRejectCount; }

 private:
  MqttRecoveryState& state_;
};

inline bool isValidFirmwareVersion(const std::string& version) {
  if (version.empty() || version.size() > 50) return false;
  size_t start = 0;
  for (int component = 0; component < 3; ++component) {
    const size_t end = version.find('.', start);
    const size_t limit = end == std::string::npos ? version.size() : end;
    if (limit == start) return false;
    for (size_t i = start; i < limit; ++i) {
      if (version[i] < '0' || version[i] > '9') return false;
    }
    if (component < 2 && end == std::string::npos) return false;
    if (component == 2 && end != std::string::npos) return false;
    start = end == std::string::npos ? version.size() : end + 1;
  }
  return true;
}

inline std::string buildFirmwareField(const std::string& version) {
  return ",\"fw\":\"" + version + "\"";
}
