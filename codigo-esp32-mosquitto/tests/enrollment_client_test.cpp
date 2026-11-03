#include <cassert>
#include <iostream>

#include "../EnrollmentClient.h"

int main() {
  DeviceConfig requestConfig;
  requestConfig.deviceId = "device-01";
  requestConfig.deviceSecret = "test-secret-only";
  assert(buildEnrollmentRequest(requestConfig) ==
         "{\"device_id\":\"device-01\",\"device_secret\":\"test-secret-only\"}");

  EnrollmentResponse response;
  assert(parseEnrollmentResponse(
      R"({"mqtt_user":"device-user","mqtt_pass":"device-pass","mqtt_host":"broker.example","mqtt_port":8883})",
      response));
  assert(response.mqttUser == "device-user");
  assert(response.mqttPassword == "device-pass");
  assert(response.mqttHost == "broker.example");
  assert(response.mqttPort == 8883);

  EnrollmentResponse invalid;
  assert(!parseEnrollmentResponse(
      R"({"mqtt_user":"device-user","mqtt_pass":"device-pass","mqtt_host":"broker.example"})",
      invalid));
  assert(enrollmentBackoffMs(1, 0) == 90000);
  assert(enrollmentBackoffMs(2, 0) == 180000);
  assert(enrollmentBackoffMs(5, 0) == 900000);
  assert(enrollmentBackoffMs(5, 14999) == 900000);
  std::cout << "OK: parsing y backoff de enrolamiento" << std::endl;
}
