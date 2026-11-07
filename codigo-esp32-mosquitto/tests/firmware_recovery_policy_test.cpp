#include <cassert>
#include <iostream>
#include <string>

#include "../FirmwareRecoveryPolicy.h"

int main() {
  assert(MQTT_AUTH_REJECT_THRESHOLD == 3);
  assert(MQTT_REENROLL_MAX_PER_HOUR == 3);
  assert(MQTT_AUTH_REJECT_THRESHOLD != MQTT_REENROLL_MAX_PER_HOUR ||
         std::string(MQTT_AUTH_REJECT_THRESHOLD_NAME) != MQTT_REENROLL_MAX_PER_HOUR_NAME);

  MqttRecoveryState nvs;
  FirmwareRecoveryPolicy policy(nvs);

  assert(!policy.recordAuthReject(1'700'000'000, true));
  assert(!policy.recordAuthReject(1'700'000'029, true));
  assert(policy.rejectCount() == 1);
  MqttRecoveryState persistedState = nvs;
  FirmwareRecoveryPolicy rebootedPolicy(persistedState);
  assert(!rebootedPolicy.recordAuthReject(1'700'000'029, true));
  assert(rebootedPolicy.rejectCount() == 1);

  assert(policy.recordAuthReject(1'700'000'030, true) == false);
  assert(policy.recordAuthReject(1'700'000'060, true) == true);
  assert(nvs.authRejectCount == 3);

  policy.onNonConclusiveEvent();
  assert(policy.rejectCount() == 0);
  assert(nvs.lastRejectEpoch == 0);

  MqttRecoveryState noTimeNvs;
  FirmwareRecoveryPolicy noTime(noTimeNvs);
  assert(!noTime.recordAuthReject(0, false));
  assert(noTime.rejectCount() == 0);
  assert(!noTime.canReenroll(0, false));
  noTimeNvs.authRejectCount = 2;
  noTimeNvs.lastRejectEpoch = 1'700'000'000;
  noTime.onNonConclusiveEvent();
  assert(noTime.rejectCount() == 0);
  assert(noTimeNvs.lastRejectEpoch == 0);

  MqttRecoveryState futureNvs;
  futureNvs.reenrollWindowStart = 2'000;
  futureNvs.reenrollHourCount = 2;
  FirmwareRecoveryPolicy future(futureNvs);
  assert(future.canReenroll(1'000, true));
  assert(futureNvs.reenrollHourCount == 0);
  assert(futureNvs.reenrollWindowStart == 1'000);
  assert(future.recordReenrollment(1'001, true));
  assert(future.recordReenrollment(1'002, true));
  assert(future.recordReenrollment(1'003, true));
  assert(!future.recordReenrollment(1'004, true));

  noTime.onMqttConnected();
  assert(noTime.rejectCount() == 0);
  noTime.onReenrollmentSucceeded();
  assert(noTime.rejectCount() == 0);

  assert(isValidFirmwareVersion("1.2.3"));
  assert(isValidFirmwareVersion("01.002.0003"));
  assert(!isValidFirmwareVersion("v1.2.3"));
  assert(!isValidFirmwareVersion("1.2"));
  assert(!isValidFirmwareVersion(""));
  assert(!isValidFirmwareVersion("1.2.3.4"));
  assert(buildFirmwareField("1.2.3") == ",\"fw\":\"1.2.3\"");

  std::cout << "OK: politica de recuperacion y lecturas con version" << std::endl;
}
