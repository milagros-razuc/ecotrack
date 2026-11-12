# Quickstart: review EcoTrack Azure deployment evidence

This guide is for a **read-only repository review**. It does not run commands against Azure or GitHub and does not require reading environment files, secret values, private keys, or passwords.

## Repository review

From the repository root:

```sh
git status --short --branch
git log -8 --oneline --decorate
git branch -avv --contains HEAD
```

Inspect implementation and configuration without printing environment values:

```sh
sed -n '1,180p' .github/workflows/ci-deploy.yml
sed -n '1,140p' scripts/deploy-production-vm.sh
sed -n '1,120p' scripts/backup-production.sh
docker compose -p ecotrack-prod --env-file .env.production.example \
  -f docker-compose.yml -f compose.production.yml config --quiet
```

The Compose command requires the example file to be present and does not print the resolved configuration. Do not substitute a real environment file into diagnostic output.

## Review a recorded deployment

Use the workflow run URL and dated notes in [evidence/acceptance.md](evidence/acceptance.md). Before treating a result as current, verify the workflow SHA, approval result, VM branch/SHA, and health result from an authorized read-only source. Do not infer current VM state from `git status` on a developer checkout.

## Backup and recovery state

The backup script creates PostgreSQL and Mosquitto Dynamic Security artifacts and checks their formats before upload. That is backup validation, not restore validation. Blob retention and isolated restore remain open until verified and recorded in [evidence/acceptance.md](evidence/acceptance.md).

## Production operating rule

After any separately authorized temporary VM test, return the checkout to `main` without discarding uncommitted work. If the checkout cannot be switched safely, stop and preserve the work for review. See [the deploy script](../../scripts/deploy-production-vm.sh) and the current [operator guide](../../docs/deployment-environments.md).
