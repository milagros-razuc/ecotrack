#!/usr/bin/env bash
# Sent by GitHub Actions through Azure Run Command; runs as root on the VM.
set -Eeuo pipefail

: "${target_sha:?The target Git commit is required}"
[[ "$target_sha" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'Invalid target SHA\n' >&2; exit 1;
}

repo=/home/ecotrackadmin/ecotrack
test "$(sudo -H -u ecotrackadmin git -C "$repo" symbolic-ref --short HEAD)" = main
sudo -H -u ecotrackadmin git -C "$repo" fetch origin main
sudo -H -u ecotrackadmin git -C "$repo" merge-base --is-ancestor HEAD "$target_sha"
sudo -H -u ecotrackadmin git -C "$repo" merge-base --is-ancestor "$target_sha" origin/main

# Back up the running release before updating its code or schema.
ECOTRACK_BACKUP_STORAGE_ACCOUNT=stecotrackbackup1311 \
  /bin/bash "$repo/scripts/backup-production.sh"

sudo -H -u ecotrackadmin git -C "$repo" merge --ff-only "$target_sha"
test "$(sudo -H -u ecotrackadmin git -C "$repo" rev-parse HEAD)" = "$target_sha"

cd "$repo"
compose=(docker compose -p ecotrack-prod --env-file .env.production \
  -f docker-compose.yml -f compose.production.yml)
"${compose[@]}" config --quiet
"${compose[@]}" build backend
"${compose[@]}" run --rm --no-deps -e ALLOW_NON_TEST_DB=1 \
  backend node scripts/run-migrations.js
"${compose[@]}" up -d --build

healthy=0
for attempt in $(seq 1 15); do
  if curl --fail --silent --show-error --max-time 10 \
    --resolve app.ecotrack.ar:443:127.0.0.1 \
    https://app.ecotrack.ar/health >/dev/null; then
    healthy=1
    break
  fi
  sleep 4
done
test "$healthy" -eq 1 || {
  printf 'Origin HTTPS health check failed\n' >&2
  "${compose[@]}" ps
  exit 1
}

"${compose[@]}" ps
printf 'ECOTRACK_DEPLOY_OK sha=%s\n' "$target_sha"
