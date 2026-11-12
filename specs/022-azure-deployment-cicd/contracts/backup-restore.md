# Contract: production backup and recovery

## Backup contents

Each backup run produces a PostgreSQL custom-format dump and the Mosquitto Dynamic Security JSON. Both artifacts are uploaded to the configured private Azure Blob container using the VM managed identity. The MQTT CA private key is not part of this backup pair.

## Backup validation

- PostgreSQL must be running; `pg_dump` must produce a non-empty archive and `pg_restore --list` must accept it.
- Mosquitto must be running; its Dynamic Security JSON must be non-empty and parse as JSON.
- Temporary `.partial` files are removed on failure. Completed local copies are retained for investigation; a local retention bound is not yet specified.
- Upload success and file-format validation are recorded as backup evidence only. They do not establish recoverability.

## Restore acceptance

- Restore PostgreSQL into an isolated database or environment; do not overwrite production during an acceptance test.
- Validate expected schema and representative records without copying sensitive values into logs or this repository.
- Validate the paired Dynamic Security JSON and document how it would be restored into an isolated Mosquitto state directory.
- Record the selected backup timestamp, isolated target, validation outcome, and any gap without exposing credentials.

## Retention

Azure Blob lifecycle/retention and local disk retention require an explicit retention decision and verification of the effective policy. Until then, retention acceptance remains pending.

## Repository source

- [Backup script](../../../scripts/backup-production.sh)
- [Operator guide](../../../docs/deployment-environments.md)
