import unittest
from pathlib import Path


class MqttCompatibilityTest(unittest.TestCase):
    def test_existing_secure_mqtt_contract_is_unchanged(self):
        source = (
            Path(__file__).resolve().parents[1]
            / "codigo-esp32-mosquitto"
            / "codigo-esp32-mosquitto.ino"
        ).read_text(encoding="utf-8")
        self.assertIn("kMqttPort = 8883", source)
        self.assertIn('return "ecotrack/" + config.deviceId + "/lecturas";', source)
        self.assertIn('payload += ",\\"ts\\":" + String(ts);', source)
        for field in ('\\"temperatura\\":', '\\"humedad\\":', '\\"luminosidad\\":'):
            self.assertIn(field, source)


if __name__ == "__main__":
    unittest.main()
