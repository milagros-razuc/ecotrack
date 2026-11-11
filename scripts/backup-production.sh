#!/usr/bin/env bash
# Back up the production database and Mosquitto Dynamic Security state to Azure Blob.
# Run as root on the Azure VM; its managed identity needs Blob Data Contributor on
# the destination container. Keep credentials out of this script and the repo.
set -Eeuo pipefail
umask 077

export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
export AZCOPY_AUTO_LOGIN_TYPE=MSI

: "${ECOTRACK_BACKUP_STORAGE_ACCOUNT:?Set ECOTRACK_BACKUP_STORAGE_ACCOUNT}"
backup_container="${ECOTRACK_BACKUP_CONTAINER:-backups}"
backup_dir="${ECOTRACK_BACKUP_DIR:-/var/backups/ecotrack}"

for command in docker azcopy python3; do
  command -v "$command" >/dev/null || { printf 'Missing command: %s\n' "$command" >&2; exit 1; }
done

# The Azure storage account and container names contain only lowercase letters,
# numbers, and (for the container) hyphens. Reject accidental shell/URL input.
[[ "$ECOTRACK_BACKUP_STORAGE_ACCOUNT" =~ ^[a-z0-9]{3,24}$ ]] || {
  printf 'Invalid Azure storage account name\n' >&2; exit 1;
}
[[ "$backup_container" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] || {
  printf 'Invalid Azure blob container name\n' >&2; exit 1;
}

install -d -m 0700 "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
db_file="$backup_dir/ecotrack-$timestamp.dump"
dynsec_file="$backup_dir/dynsec-$timestamp.json"
db_partial="$db_file.partial"
dynsec_partial="$dynsec_file.partial"

cleanup_partial() {
  rm -f -- "$db_partial" "$dynsec_partial"
}
trap cleanup_partial EXIT

docker inspect -f '{{.State.Running}}' ecotrack_db | grep -qx true
docker inspect -f '{{.State.Running}}' ecotrack_mqtt | grep -qx true

docker exec ecotrack_db sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$db_partial"
test -s "$db_partial"
docker exec -i ecotrack_db pg_restore --list < "$db_partial" > /dev/null

docker exec ecotrack_mqtt cat /mosquitto/data/dynamic-security.json > "$dynsec_partial"
test -s "$dynsec_partial"
python3 -m json.tool "$dynsec_partial" > /dev/null

mv -- "$db_partial" "$db_file"
mv -- "$dynsec_partial" "$dynsec_file"

destination="https://${ECOTRACK_BACKUP_STORAGE_ACCOUNT}.blob.core.windows.net/${backup_container}"
azcopy copy "$db_file" "$destination/$(basename "$db_file")" --overwrite=false
azcopy copy "$dynsec_file" "$destination/$(basename "$dynsec_file")" --overwrite=false

printf 'Uploaded verified backups: %s and %s\n' \
  "$(basename "$db_file")" "$(basename "$dynsec_file")"
