import unittest
from pathlib import Path


class NoFactorySecretsTest(unittest.TestCase):
    def test_source_has_no_default_softap_password_or_factory_secret_macros(self):
        root = Path(__file__).resolve().parents[1]
        source = "\n".join(
            path.read_text(encoding="utf-8", errors="ignore")
            for path in root.glob("codigo-esp32-mosquitto/*")
            if path.suffix in {".cpp", ".h", ".ino"}
        )
        self.assertNotIn("SECRET_SETUP_AP_PASS", source)
        self.assertNotIn('"EcoTrack-Setup"', source)
        self.assertNotIn("SECRET_DEVICE_SECRET", source)


if __name__ == "__main__":
    unittest.main()
