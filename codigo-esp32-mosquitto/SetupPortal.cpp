#include "SetupPortal.h"

#include <DNSServer.h>
#include <WebServer.h>
#include <WiFi.h>

#include "SetupPortalPage.h"
#include "esp32Secret.h"

#ifndef SECRET_SETUP_AP_PASS
#define SECRET_SETUP_AP_PASS "EcoTrack-Setup"
#endif

namespace {
DNSServer dns;
WebServer web(80);
DeviceConfig* activeConfig = nullptr;
void (*connectCallback)() = nullptr;
String currentStatus = "READY";
bool active = false;
bool routesRegistered = false;

String htmlEscape(String value) {
  value.replace("&", "&amp;");
  value.replace("<", "&lt;");
  value.replace(">", "&gt;");
  value.replace("\"", "&quot;");
  value.replace("'", "&#39;");
  return value;
}

void noCache() {
  web.sendHeader("Cache-Control", "no-store");
}

String jsonString(const String& value) {
  String result = "\"";
  for (size_t i = 0; i < value.length(); ++i) {
    const char c = value[i];
    if (c == '"' || c == '\\') result += '\\';
    if (static_cast<unsigned char>(c) >= 32) result += c;
  }
  return result + '"';
}

void listNetworks() {
  if (currentStatus == "WIFI_CONNECTING" || currentStatus == "MQTT_CONNECTING") {
    web.send(409, "application/json", "[]");
    return;
  }
  const int count = WiFi.scanNetworks(false, true);
  String result = "[";
  int shown = 0;
  for (int i = 0; i < count && shown < 20; ++i) {
    const String ssid = WiFi.SSID(i);
    if (ssid.isEmpty()) continue;
    bool duplicate = false;
    for (int j = 0; j < i; ++j) {
      if (WiFi.SSID(j) == ssid) { duplicate = true; break; }
    }
    if (duplicate) continue;
    if (shown++) result += ',';
    result += jsonString(ssid);
  }
  WiFi.scanDelete();
  result += ']';
  noCache();
  web.send(200, "application/json; charset=utf-8", result);
}

void showForm() {
  String page = FPSTR(kSetupPortalPage);
  page.replace("{{SSID}}", htmlEscape(activeConfig->ssid));
  page.replace("{{MQTT_HOST}}", htmlEscape(activeConfig->mqttHost));
  page.replace("{{DEVICE_ID}}", htmlEscape(activeConfig->deviceId));
  page.replace("{{MQTT_USER}}", htmlEscape(activeConfig->mqttUser));
  noCache();
  web.send(200, "text/html; charset=utf-8", page);
}

void saveForm() {
  if (currentStatus == "WIFI_CONNECTING") {
    web.send(409, "text/plain; charset=utf-8", "Ya se está probando WiFi.");
    return;
  }
  DeviceConfig candidate = *activeConfig;
  String error;
  const char* names[] = {"SSID", "MQTT_HOST", "DEVICE_ID", "MQTT_USER"};
  const char* args[] = {"ssid", "mqttHost", "deviceId", "mqttUser"};
  for (size_t i = 0; i < 4; ++i) {
    if (!web.hasArg(args[i])) {
      web.send(400, "text/plain; charset=utf-8", "Falta completar " + String(names[i]));
      return;
    }
    if (!setConfigField(candidate, names[i], web.arg(args[i]), error)) {
      web.send(400, "text/plain; charset=utf-8", "Campo inválido: " + String(names[i]) + ". " + error);
      return;
    }
  }
  if (web.hasArg("openWifi")) {
    if (!setConfigField(candidate, "PASS", "", error)) {
      web.send(400, "text/plain; charset=utf-8", error);
      return;
    }
  } else if (web.hasArg("wifiPass") && !web.arg("wifiPass").isEmpty()) {
    if (!setConfigField(candidate, "PASS", web.arg("wifiPass"), error)) {
      web.send(400, "text/plain; charset=utf-8", error);
      return;
    }
  }
  if (web.hasArg("mqttPass") && !web.arg("mqttPass").isEmpty()) {
    if (!setConfigField(candidate, "MQTT_PASS", web.arg("mqttPass"), error)) {
      web.send(400, "text/plain; charset=utf-8", error);
      return;
    }
  }
  if (!validateConfig(candidate, error)) {
    web.send(400, "text/plain; charset=utf-8", error);
    return;
  }
  *activeConfig = candidate;
  noCache();
  web.send(200, "text/plain; charset=utf-8", "Datos válidos. Probando la conexión WiFi…");
  currentStatus = "WIFI_CONNECTING";
  connectCallback();
}
}  // namespace

bool startSetupPortal(const String& apName, DeviceConfig& config, void (*connectWifi)()) {
  if (active) return true;
  activeConfig = &config;
  connectCallback = connectWifi;
  currentStatus = "READY";
  WiFi.mode(WIFI_AP_STA);
  if (!WiFi.softAP(apName.c_str(), SECRET_SETUP_AP_PASS)) return false;
  dns.start(53, "*", WiFi.softAPIP());
  if (!routesRegistered) {
    web.on("/", HTTP_GET, showForm);
    web.on("/networks", HTTP_GET, listNetworks);
    web.on("/save", HTTP_POST, saveForm);
    web.on("/status", HTTP_GET, []() {
      noCache();
      web.send(200, "text/plain; charset=utf-8", currentStatus);
    });
    web.onNotFound([]() {
      web.sendHeader("Location", "http://192.168.4.1/");
      web.send(302, "text/plain", "");
    });
    routesRegistered = true;
  }
  web.begin();
  active = true;
  return true;
}

void pollSetupPortal() {
  if (!active) return;
  dns.processNextRequest();
  web.handleClient();
}

void stopSetupPortal() {
  if (!active) return;
  web.stop();
  dns.stop();
  WiFi.softAPdisconnect(false);
  active = false;
}

bool setupPortalActive() { return active; }

void setupPortalStatus(const String& message) { currentStatus = message; }
