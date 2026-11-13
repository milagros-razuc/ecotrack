#!/usr/bin/env bash
# Sent by GitHub Actions through Azure Run Command; runs as root on the VM.
# RunShellScript can invoke the generated file with sh, ignoring this shebang.
if [ -z "${BASH_VERSION:-}" ]; then
  export target_sha
  exec /bin/bash "$0" "$@"
fi
set -Eeuo pipefail

: "${target_sha:?The target Git commit is required}"
[[ "$target_sha" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'Invalid target SHA\n' >&2; exit 1;
}

repo=/home/ecotrackadmin/ecotrack
branch=$(sudo -H -u ecotrackadmin git -C "$repo" symbolic-ref --quiet --short HEAD) || {
  printf 'VM checkout has no active branch; return it to main before deploying.\n' >&2
  exit 1
}
if [[ "$branch" != main ]]; then
  printf 'VM checkout is on %s; return it to main after temporary tests before deploying.\n' "$branch" >&2
  exit 1
fi
sudo -H -u ecotrackadmin git -C "$repo" fetch origin main
sudo -H -u ecotrackadmin git -C "$repo" merge-base --is-ancestor "$target_sha" origin/main || {
  printf 'Target SHA %s is not present in origin/main\n' "$target_sha" >&2
  exit 1
}
sudo -H -u ecotrackadmin git -C "$repo" diff --quiet || {
  printf 'Production checkout has uncommitted tracked changes; stop and preserve work before deploying.\n' >&2
  exit 1
}
sudo -H -u ecotrackadmin git -C "$repo" diff --cached --quiet || {
  printf 'Production checkout has staged changes; stop and preserve work before deploying.\n' >&2
  exit 1
}
if ! sudo -H -u ecotrackadmin git -C "$repo" merge-base --is-ancestor HEAD "$target_sha"; then
  current_sha=$(sudo -H -u ecotrackadmin git -C "$repo" rev-parse --short HEAD)
  printf 'Main branch diverged at %s; resetting checkout to tested SHA %s.\n' "$current_sha" "$target_sha" >&2
fi

# Back up the running release before updating its code or schema.
ECOTRACK_BACKUP_STORAGE_ACCOUNT=stecotrackbackup1311 \
  /bin/bash "$repo/scripts/backup-production.sh"

sudo -H -u ecotrackadmin git -C "$repo" reset --hard "$target_sha"
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
