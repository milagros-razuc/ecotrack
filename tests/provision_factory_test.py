import csv
import importlib.util
import sys
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.provision_factory import (
    FactoryIdentity,
    NvsGenerationError,
    _write_nvs_csv,
    _run_nvs_generator,
    generate_identity,
    provision,
    valid_server_host,
)


class ProvisionFactoryTest(unittest.TestCase):
    def test_identity_is_random_and_valid(self):
        first = generate_identity("broker.ecotrack.local")
        second = generate_identity("broker.ecotrack.local")
        self.assertNotEqual(first, second)
        self.assertRegex(first.device_id, r"^ET-[A-Z2-9]{12}$")
        self.assertGreaterEqual(len(first.softap_password), 8)
        self.assertRegex(first.setup_pin, r"^[0-9]{6}$")
        self.assertEqual(first.server_host, "broker.ecotrack.local")
        self.assertEqual(len(first.device_secret), 64)

    def test_server_host_accepts_hostname_and_ipv4_only(self):
        self.assertTrue(valid_server_host("broker.ecotrack.local"))
        self.assertTrue(valid_server_host("192.168.1.10"))
        self.assertFalse(valid_server_host("broker with spaces"))
        self.assertFalse(valid_server_host("256.1.1.1"))

    def test_nvs_csv_contains_only_factory_values(self):
        identity = FactoryIdentity(
            "ET-TEST12345678", "Password123", "a" * 64, "123456", "broker.ecotrack.local"
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "identity.csv"
            _write_nvs_csv(path, identity)
            content = path.read_text(encoding="utf-8")
            self.assertIn("factoryReady,data,u8,1", content)
            self.assertIn(identity.device_id, content)
            rows = list(csv.reader(content.splitlines()))
            self.assertEqual(rows[1], ["ecotrack", "namespace", "", ""])
            self.assertIn(["setupPin", "data", "string", "123456"], rows)
            self.assertIn(
                ["serverHost", "data", "string", "broker.ecotrack.local"], rows
            )
            self.assertNotIn("wifiPass", content)
            self.assertNotIn("mqttPass", content)

    @patch("scripts.provision_factory.subprocess.run")
    def test_default_nvs_generator_uses_current_python_module(self, run):
        _run_nvs_generator(None, Path("input.csv"), Path("output.bin"), "0x5000")
        command = run.call_args.args[0]
        self.assertEqual(
            command,
            [
                sys.executable,
                "-m",
                "esp_idf_nvs_partition_gen",
                "generate",
                "input.csv",
                "output.bin",
                "0x5000",
            ],
        )

    @patch("scripts.provision_factory.time.sleep")
    @patch("scripts.provision_factory.subprocess.run")
    def test_windows_sharing_violation_is_retried(self, run, sleep):
        error = subprocess.CalledProcessError(
            1,
            ["nvs-generator"],
            stderr="PermissionError: [WinError 32] archivo en uso",
        )
        run.side_effect = [error, error, error]
        with self.assertRaises(NvsGenerationError):
            _run_nvs_generator(
                None,
                Path("input.csv"),
                Path("output.bin"),
                "0x5000",
                FactoryIdentity("ET-TEST123456", "Password123", "b" * 64, "123456", "localhost"),
            )
        self.assertEqual(run.call_count, 3)
        self.assertEqual(sleep.call_count, 2)

    @patch("scripts.provision_factory.subprocess.run")
    def test_python_file_generator_uses_current_python(self, run):
        _run_nvs_generator("custom_generator.py", Path("input.csv"), Path("output.bin"), "0x5000")
        self.assertEqual(run.call_args.args[0][0], sys.executable)
        self.assertEqual(run.call_args.args[0][1], "custom_generator.py")

    @patch("scripts.provision_factory.generate_identity")
    def test_provision_rejects_duplicate_identity(self, generate):
        duplicate = FactoryIdentity(
            "ET-DUPLICATE123", "Password123", "b" * 64, "123456", "localhost"
        )
        generate.return_value = duplicate
        with tempfile.TemporaryDirectory() as parent:
            with self.assertRaises(RuntimeError):
                provision(2, Path(parent) / "factory", "nvs_partition_gen.py", "0x5000")

    @patch("scripts.provision_factory._run_nvs_generator")
    def test_provision_writes_manifest_images_and_labels(self, run_generator):
        with tempfile.TemporaryDirectory() as parent:
            output = Path(parent) / "factory"
            def create_image(_, __, image_path, ___, ____):
                with image_path.open("wb") as image:
                    image.write(b"nvs")
            run_generator.side_effect = create_image
            provision(2, output, "nvs_partition_gen.py", "0x5000")
            with (output / "factory.csv").open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 2)
            self.assertEqual(len(list(output.glob("*.nvs.bin"))), 2)
            self.assertEqual(len(list(output.glob("*.label.txt"))), 2)
            self.assertNotEqual(rows[0]["softap_password"], rows[1]["softap_password"])
            for label_path in output.glob("*.label.txt"):
                label = label_path.read_text(encoding="utf-8")
                self.assertIn("setup_pin=", label)
                self.assertIn("server_host=", label)
                self.assertNotIn("softap_password", label)

    @patch("scripts.provision_factory.subprocess.run")
    def test_nvs_image_is_not_open_before_generator(self, run):
        def verify_image_is_writable(command, **_):
            image_path = Path(command[command.index("generate") + 2])
            with image_path.open("wb") as image:
                image.write(b"nvs")

        run.side_effect = verify_image_is_writable
        with tempfile.TemporaryDirectory() as parent:
            output = Path(parent) / "factory"
            provision(1, output, None, "0x5000")
            self.assertEqual(len(list(output.glob("*.nvs.bin"))), 1)
            self.assertEqual(list(output.glob("device-*")), [])

    @unittest.skipUnless(
        importlib.util.find_spec("esp_idf_nvs_partition_gen"),
        "esp-idf-nvs-partition-gen is not installed",
    )
    def test_real_generator_accepts_factory_csv(self):
        identity = FactoryIdentity(
            "ET-REALTEST123", "Password123", "a" * 64, "123456", "localhost"
        )
        with tempfile.TemporaryDirectory() as parent:
            directory = Path(parent)
            csv_path = directory / "nvs.csv"
            image_path = directory / "nvs.bin"
            _write_nvs_csv(csv_path, identity)
            _run_nvs_generator(None, csv_path, image_path, "0x5000", identity)
            self.assertEqual(image_path.stat().st_size, 0x5000)

    @patch("scripts.provision_factory._run_nvs_generator")
    def test_existing_empty_output_is_reused(self, run_generator):
        run_generator.side_effect = lambda _, __, image_path, ___, ____: image_path.write_bytes(
            b"nvs"
        )
        with tempfile.TemporaryDirectory() as parent:
            output = Path(parent) / "factory"
            output.mkdir()
            provision(1, output, "nvs_partition_gen.py", "0x5000")
            self.assertTrue((output / "factory.csv").exists())

    @patch("scripts.provision_factory.generate_identity")
    def test_existing_nonempty_output_is_rejected(self, generate):
        generate.return_value = FactoryIdentity(
            "ET-TEST123456", "Password123", "b" * 64, "123456", "localhost"
        )
        with tempfile.TemporaryDirectory() as parent:
            output = Path(parent) / "factory"
            output.mkdir()
            marker = output / "existing.txt"
            marker.write_text("keep", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "no esta vacio"):
                provision(1, output, None, "0x5000")
            self.assertEqual(marker.read_text(encoding="utf-8"), "keep")

    @patch("scripts.provision_factory.generate_identity")
    @patch("scripts.provision_factory.subprocess.run")
    def test_generator_error_shows_sanitized_last_stderr_line_and_keeps_csv(
        self, run, generate
    ):
        identity = FactoryIdentity(
            "ET-TEST123456", "ApPassword123", "s" * 64, "123456", "localhost"
        )
        generate.return_value = identity
        run.side_effect = subprocess.CalledProcessError(
            1,
            ["nvs-generator"],
            stderr=(
                f"failed with {identity.device_id} {identity.softap_password} "
                f"{identity.device_secret}\n"
                f"last line contains {identity.device_id} and {identity.softap_password}"
            ),
        )
        with tempfile.TemporaryDirectory() as parent:
            output = Path(parent) / "factory"
            with self.assertRaisesRegex(NvsGenerationError, "last line contains") as raised:
                provision(1, output, None, "0x5000", keep_on_error=True)
            message = str(raised.exception)
            self.assertNotIn(identity.device_id, message)
            self.assertNotIn(identity.softap_password, message)
            self.assertNotIn(identity.device_secret, message)
            self.assertNotIn(identity.setup_pin, message)
            self.assertEqual(len(list(output.glob("*.nvs.csv"))), 1)


if __name__ == "__main__":
    unittest.main()
