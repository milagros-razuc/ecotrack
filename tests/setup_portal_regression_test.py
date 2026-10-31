import unittest
from pathlib import Path


class SetupPortalRegressionTest(unittest.TestCase):
    def test_successful_connection_closes_ap_before_running_mode(self):
        source = (
            Path(__file__).resolve().parents[1]
            / "codigo-esp32-mosquitto"
            / "codigo-esp32-mosquitto.ino"
        ).read_text(encoding="utf-8")
        success = source.index('setupPortalStatus("READY:"')
        stop_portal = source.index("stopSetupPortal();", success)
        station = source.index("WiFi.mode(WIFI_STA);", success)
        running = source.index("mode = Mode::running;", station)
        portal_source = (
            Path(__file__).resolve().parents[1]
            / "codigo-esp32-mosquitto"
            / "SetupPortal.cpp"
        ).read_text(encoding="utf-8")
        self.assertIn("WiFi.softAPdisconnect(true)", portal_source)
        self.assertIn("WiFi.softAP(apName.c_str())", portal_source)
        self.assertIn("kMaxPinAttempts = 5", portal_source)
        self.assertIn("kPinLockoutMs = 5UL * 60UL * 1000UL", portal_source)
        self.assertIn('web.on("/unlock", HTTP_POST, unlockPortal)', portal_source)
        self.assertIn("if (!pinAuthenticated)", portal_source)
        self.assertIn("portalStartedAt", portal_source)
        self.assertIn("#ifdef ECOTRACK_DEV_PORTAL", portal_source)
        self.assertIn("constexpr size_t fieldCount = 1", portal_source)
        self.assertLess(stop_portal, station)
        self.assertLess(station, running)

    def test_production_does_not_require_mqtt_user_or_password(self):
        config_source = (
            Path(__file__).resolve().parents[1]
            / "codigo-esp32-mosquitto"
            / "DeviceConfig.cpp"
        ).read_text(encoding="utf-8")
        firmware_source = (
            Path(__file__).resolve().parents[1]
            / "codigo-esp32-mosquitto"
            / "codigo-esp32-mosquitto.ino"
        ).read_text(encoding="utf-8")
        self.assertIn("#ifdef ECOTRACK_DEV_PORTAL", config_source)
        validation = config_source[config_source.index("bool validateConfig"):]
        self.assertIn("#else\n    error = \"\";", validation)
        self.assertIn("mqtt.connect(config.deviceId.c_str());", firmware_source)
        self.assertIn("mqtt.setServer(config.serverHost.c_str(), kMqttPort);", firmware_source)


if __name__ == "__main__":
    unittest.main()
