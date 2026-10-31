import csv
import unittest
from pathlib import Path


class PartitionSchemeTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[1]
        self.partition_file = self.root / "codigo-esp32-mosquitto" / "partitions.csv"

    def test_partition_has_two_application_slots_and_filesystem(self):
        rows = []
        with self.partition_file.open(newline="", encoding="utf-8") as handle:
            for row in csv.reader(
                line for line in handle if line.strip() and not line.lstrip().startswith("#")
            ):
                rows.append([cell.strip() for cell in row])
        names = {row[0] for row in rows}
        self.assertIn("app0", names)
        self.assertIn("app1", names)
        littlefs = next(row for row in rows if row[0] == "littlefs")
        self.assertEqual(littlefs[1:3], ["data", "spiffs"])

    def test_partition_layout_matches_four_megabyte_minimal_spiffs(self):
        rows = {}
        with self.partition_file.open(newline="", encoding="utf-8") as handle:
            for row in csv.reader(
                line for line in handle if line.strip() and not line.lstrip().startswith("#")
            ):
                values = [cell.strip() for cell in row]
                rows[values[0]] = (int(values[3], 0), int(values[4], 0))

        self.assertEqual(rows["nvs"], (0x9000, 0x5000))
        self.assertEqual(rows["otadata"], (0xE000, 0x2000))
        self.assertEqual(rows["app0"], (0x10000, 0x1E0000))
        self.assertEqual(rows["app1"], (0x1F0000, 0x1E0000))
        self.assertEqual(rows["littlefs"], (0x3D0000, 0x20000))

        ranges = sorted((offset, offset + size, name) for name, (offset, size) in rows.items())
        for previous, current in zip(ranges, ranges[1:]):
            self.assertLessEqual(previous[1], current[0], (previous, current))
        self.assertLessEqual(ranges[-1][1], 0x400000)

    def test_firmware_does_not_implement_ota(self):
        source = "\n".join(
            path.read_text(encoding="utf-8", errors="ignore")
            for path in (self.root / "codigo-esp32-mosquitto").glob("*")
            if path.suffix in {".cpp", ".h", ".ino"}
        )
        self.assertNotRegex(source, r"\b(Update|ArduinoOTA|HTTPUpdate)\b")


if __name__ == "__main__":
    unittest.main()
