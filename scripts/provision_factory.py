#!/usr/bin/env python3
"""Generate per-device factory identity records and NVS images."""

from __future__ import annotations

import argparse
import csv
import ipaddress
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

DEVICE_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
DEVICE_ID_LENGTH = 12
SOFTAP_PASSWORD_LENGTH = 16
DEVICE_SECRET_LENGTH = 64
SETUP_PIN_LENGTH = 6
HOSTNAME_PATTERN = re.compile(
    r"(?=.{1,253}\Z)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\Z"
)


@dataclass(frozen=True)
class FactoryIdentity:
    device_id: str
    softap_password: str
    device_secret: str
    setup_pin: str = ""
    server_host: str = ""


class NvsGenerationError(RuntimeError):
    """Raised when the NVS generator fails without exposing generated secrets."""


def _token(alphabet: str, length: int) -> str:
    return "".join(secrets.choice(alphabet) for _ in range(length))


def valid_server_host(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        if value.count(".") == 3 and all(part.isdigit() for part in value.split(".")):
            return False
        return bool(HOSTNAME_PATTERN.fullmatch(value))


def generate_identity(server_host: str = "localhost") -> FactoryIdentity:
    return FactoryIdentity(
        device_id="ET-" + _token(DEVICE_ID_ALPHABET, DEVICE_ID_LENGTH),
        softap_password=_token(PASSWORD_ALPHABET, SOFTAP_PASSWORD_LENGTH),
        device_secret=secrets.token_hex(DEVICE_SECRET_LENGTH // 2),
        setup_pin="".join(secrets.choice("0123456789") for _ in range(SETUP_PIN_LENGTH)),
        server_host=server_host,
    )


def _write_nvs_csv(path: Path, identity: FactoryIdentity) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["key", "type", "encoding", "value"])
        writer.writerow(["ecotrack", "namespace", "", ""])
        writer.writerow(["factoryReady", "data", "u8", "1"])
        writer.writerow(["deviceId", "data", "string", identity.device_id])
        writer.writerow(["softApPass", "data", "string", identity.softap_password])
        writer.writerow(["setupPin", "data", "string", identity.setup_pin])
        writer.writerow(["serverHost", "data", "string", identity.server_host])
        writer.writerow(["deviceSecret", "data", "string", identity.device_secret])


def _sanitize_error(message: str, identity: FactoryIdentity | None) -> str:
    if identity is None:
        return message
    sanitized = message
    secrets_to_redact = [
        secret
        for secret in (
            identity.device_id,
            identity.softap_password,
            identity.setup_pin,
            identity.device_secret,
        )
        if secret
    ]
    for secret in sorted(secrets_to_redact, key=len, reverse=True):
        sanitized = sanitized.replace(secret, "[REDACTED]")
    return sanitized


def _run_nvs_generator(
    generator: str | None,
    csv_path: Path,
    image_path: Path,
    size: str,
    identity: FactoryIdentity | None = None,
) -> None:
    if generator is None:
        command = [
            sys.executable,
            "-m",
            "esp_idf_nvs_partition_gen",
            "generate",
            str(csv_path),
            str(image_path),
            size,
        ]
    elif Path(generator).suffix.lower() == ".py":
        command = [sys.executable, generator, "generate", str(csv_path), str(image_path), size]
    else:
        command = [generator, "generate", str(csv_path), str(image_path), size]
    last_error: subprocess.CalledProcessError | None = None
    for attempt in range(3):
        try:
            subprocess.run(command, check=True, capture_output=True, text=True)
            return
        except subprocess.CalledProcessError as error:
            last_error = error
            stderr = error.stderr or ""
            if "PermissionError" not in stderr or "WinError 32" not in stderr or attempt == 2:
                break
            time.sleep(0.5)

    assert last_error is not None
    stderr = last_error.stderr or ""
    last_line = next((line.strip() for line in reversed(stderr.splitlines()) if line.strip()), "")
    detail = _sanitize_error(last_line or "sin detalle de stderr", identity)
    raise NvsGenerationError(f"generador NVS: {detail}") from last_error


def _preserve_intermediate_csvs(temp: Path, output: Path) -> None:
    for csv_path in temp.glob("*/nvs.csv"):
        shutil.copy2(csv_path, output / f"{csv_path.parent.name}.nvs.csv")


def _prepare_output(output: Path) -> None:
    if output.exists():
        if not output.is_dir():
            raise ValueError(f"output no es un directorio: {output}")
        if any(output.iterdir()):
            raise ValueError(f"output ya existe y no esta vacio: {output}")
        return
    output.mkdir(parents=True)


def provision(
    count: int,
    output: Path,
    generator: str | None,
    size: str,
    keep_on_error: bool = False,
    server_host: str = "localhost",
) -> Path:
    if count < 1:
        raise ValueError("count debe ser mayor que cero")
    if not valid_server_host(server_host):
        raise ValueError("server-host debe ser un hostname o IPv4 valido")
    output = output.resolve()
    repo_root = Path(__file__).resolve().parents[1]
    try:
        output.relative_to(repo_root)
    except ValueError:
        pass
    else:
        raise ValueError("output debe estar fuera del repositorio")

    output.parent.mkdir(parents=True, exist_ok=True)
    _prepare_output(output)

    identities = [generate_identity(server_host) for _ in range(count)]
    if len({item.device_id for item in identities}) != count:
        raise RuntimeError("colision de device_id")
    if len({item.softap_password for item in identities}) != count:
        raise RuntimeError("colision de clave SoftAP")
    if len({item.device_secret for item in identities}) != count:
        raise RuntimeError("colision de secreto")

    with tempfile.TemporaryDirectory(prefix="ecotrack-factory-", dir=output) as temp_name:
        temp = Path(temp_name)
        rows = []
        for index, identity in enumerate(identities, start=1):
            device_temp = temp / f"device-{index:03d}"
            device_temp.mkdir()
            csv_path = device_temp / "nvs.csv"
            image_path = device_temp / "nvs.bin"
            _write_nvs_csv(csv_path, identity)
            try:
                _run_nvs_generator(generator, csv_path, image_path, size, identity)
            except NvsGenerationError:
                if keep_on_error:
                    _preserve_intermediate_csvs(temp, output)
                raise
            image_name = f"{identity.device_id}.nvs.bin"
            csv_path.unlink()
            shutil.move(str(image_path), temp / image_name)
            rows.append((identity, image_name))
            device_temp.rmdir()

        manifest_tmp = temp / "factory.csv"
        with manifest_tmp.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(
                [
                    "device_id",
                    "softap_password",
                    "setup_pin",
                    "server_host",
                    "device_secret",
                    "nvs_image",
                    "created_at",
                ]
            )
            created_at = datetime.now(timezone.utc).isoformat()
            for identity, image_name in rows:
                writer.writerow(
                    [
                        identity.device_id,
                        identity.softap_password,
                        identity.setup_pin,
                        identity.server_host,
                        identity.device_secret,
                        image_name,
                        created_at,
                    ]
                )
                (temp / f"{identity.device_id}.label.txt").write_text(
                    f"device_id={identity.device_id}\n"
                    f"setup_pin={identity.setup_pin}\n"
                    f"server_host={identity.server_host}\n"
                    f"device_secret={identity.device_secret}\n"
                    f"nvs_image={image_name}\n",
                    encoding="utf-8",
                )

        for item in temp.iterdir():
            shutil.move(str(item), output / item.name)
    return output


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--nvs-generator", default=None)
    parser.add_argument("--nvs-size", default="0x5000")
    parser.add_argument("--server-host", required=True)
    parser.add_argument(
        "--keep-on-error",
        action="store_true",
        help="conservar los CSV NVS intermedios si falla el generador",
    )
    args = parser.parse_args(argv)
    try:
        provision(
            args.count,
            args.output,
            args.nvs_generator,
            args.nvs_size,
            args.keep_on_error,
            args.server_host,
        )
    except NvsGenerationError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except (OSError, RuntimeError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
