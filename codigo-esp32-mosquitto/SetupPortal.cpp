#include "SetupPortal.h"

#include <DNSServer.h>
#include <WebServer.h>
#include <WiFi.h>

#include "SetupPortalPage.h"

namespace {
constexpr unsigned long kPortalTimeoutMs = 10UL * 60UL * 1000UL;
constexpr unsigned long kPinLockoutMs = 5UL * 60UL * 1000UL;
constexpr uint8_t kMaxPinAttempts = 5;
DNSServer dns;
WebServer web(80);
DeviceConfig* activeConfig = nullptr;
void (*connectCallback)() = nullptr;
String currentStatus = "READY";
bool active = false;
bool routesRegistered = false;
unsigned long lastActivityAt = 0;
unsigned long portalStartedAt = 0;
unsigned long pinLockedUntil = 0;
uint8_t failedPinAttempts = 0;
bool pinAuthenticated = false;

void markActivity() {
  lastActivityAt = millis();
}

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
  markActivity();
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
  markActivity();
  if (!pinAuthenticated) {
    noCache();
    web.send_P(200, "text/html; charset=utf-8", kSetupPinPage);
    return;
  }
  String page = FPSTR(kSetupPortalPage);
  page.replace("{{SSID}}", htmlEscape(activeConfig->ssid));
#ifdef ECOTRACK_DEV_PORTAL
  page.replace("{{DEV_FIELDS}}", FPSTR(kSetupDevFields));
  page.replace("{{MQTT_HOST}}", htmlEscape(activeConfig->mqttHost));
  page.replace("{{DEVICE_ID}}", htmlEscape(activeConfig->deviceId));
  page.replace("{{MQTT_USER}}", htmlEscape(activeConfig->mqttUser));
#else
  page.replace("{{DEV_FIELDS}}", "");
#endif
  noCache();
  web.send(200, "text/html; charset=utf-8", page);
}

void unlockPortal() {
  if (static_cast<long>(millis() - pinLockedUntil) < 0) {
    web.send(429, "text/plain; charset=utf-8", "Portal bloqueado temporalmente.");
    return;
  }
  if (!web.hasArg("setupPin") || web.arg("setupPin") != activeConfig->setupPin) {
    ++failedPinAttempts;
    if (failedPinAttempts >= kMaxPinAttempts) {
      failedPinAttempts = 0;
      pinLockedUntil = millis() + kPinLockoutMs;
      web.send(429, "text/plain; charset=utf-8",
               "Demasiados intentos. Reintente en 5 minutos.");
    } else {
      web.send(401, "text/plain; charset=utf-8", "PIN incorrecto.");
    }
    return;
  }
  failedPinAttempts = 0;
  pinAuthenticated = true;
  web.send(200, "text/plain; charset=utf-8", "PIN correcto.");
}

void saveForm() {
  if (!pinAuthenticated) {
    web.send(401, "text/plain; charset=utf-8", "Se requiere el PIN.");
    return;
  }
  if (currentStatus == "WIFI_CONNECTING") {
    web.send(409, "text/plain; charset=utf-8", "Ya se está probando WiFi.");
    return;
  }
  DeviceConfig candidate = *activeConfig;
  String error;
#ifdef ECOTRACK_DEV_PORTAL
  const char* names[] = {"SSID", "MQTT_HOST", "DEVICE_ID", "MQTT_USER"};
  const char* args[] = {"ssid", "mqttHost", "deviceId", "mqttUser"};
  constexpr size_t fieldCount = 4;
#else
  const char* names[] = {"SSID"};
  const char* args[] = {"ssid"};
  constexpr size_t fieldCount = 1;
#endif
  for (size_t i = 0; i < fieldCount; ++i) {
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
#ifdef ECOTRACK_DEV_PORTAL
  if (web.hasArg("mqttPass") && !web.arg("mqttPass").isEmpty()) {
    if (!setConfigField(candidate, "MQTT_PASS", web.arg("mqttPass"), error)) {
      web.send(400, "text/plain; charset=utf-8", error);
      return;
    }
  }
#endif
  if (!validateConfig(candidate, error)) {
    web.send(400, "text/plain; charset=utf-8", error);
    return;
  }
  *activeConfig = candidate;
  markActivity();
  noCache();
  web.send(200, "text/plain; charset=utf-8", "Datos válidos. Probando la conexión WiFi…");
  currentStatus = "WIFI_CONNECTING";
  connectCallback();
}
}  // namespace

bool startSetupPortal(const String& apName, DeviceConfig& config,
                      void (*connectWifi)()) {
  if (active) return true;
  activeConfig = &config;
  connectCallback = connectWifi;
  currentStatus = "READY";
  lastActivityAt = millis();
  portalStartedAt = lastActivityAt;
  pinAuthenticated = false;
  failedPinAttempts = 0;
  pinLockedUntil = 0;
  WiFi.mode(WIFI_AP_STA);
  if (!WiFi.softAP(apName.c_str())) return false;
  dns.start(53, "*", WiFi.softAPIP());
  if (!routesRegistered) {
    web.on("/", HTTP_GET, showForm);
    web.on("/unlock", HTTP_POST, unlockPortal);
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
  if (setupPortalExpired(millis())) {
    currentStatus = "PORTAL_EXPIRED";
    stopSetupPortal();
    return;
  }
  dns.processNextRequest();
  web.handleClient();
}

void stopSetupPortal() {
  if (!active) return;
  web.stop();
  dns.stop();
  WiFi.softAPdisconnect(true);
  active = false;
  lastActivityAt = 0;
  portalStartedAt = 0;
  pinAuthenticated = false;
}

bool setupPortalActive() { return active; }

void setupPortalStatus(const String& message) { currentStatus = message; }

bool setupPortalExpired(unsigned long now) {
  return active && portalStartedAt != 0 &&
         static_cast<unsigned long>(now - portalStartedAt) >= kPortalTimeoutMs;
}
