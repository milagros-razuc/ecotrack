# Contract: guarded CI and Azure VM deployment

## Trigger and gate

- Pull requests and pushes to `main` run the CI job.
- Production deployment is eligible only for `main`, after CI passes, when `DEPLOY_ENABLED` is `true` and the `production` environment grants the run approval.
- The deploy job requests an OIDC token and targets the configured VM through Azure Run Command. It does not use inbound SSH from the runner.

## Deployment preconditions and sequence

1. The workflow checks out the tested commit and passes its full SHA to the VM script.
2. The VM checkout has an active `main` branch; the script fails with a diagnostic if another branch is active.
3. The current release is backed up before checkout or schema changes.
4. The target SHA is an ancestor of the VM's `origin/main` and is fast-forwarded only.
5. Production Compose configuration is validated, backend is built, pending SQL migrations run, and services are rebuilt.
6. The VM checks origin HTTPS `/health` and emits `ECOTRACK_DEPLOY_OK sha=<tested-sha>` only after success.

## Failure behavior

- A failed backup, ancestry check, Compose validation, build, migration, or health check fails the deployment.
- The workflow does not automatically roll back database migrations. Operators diagnose the failure and decide separately whether to restore.
- A temporary test on a non-`main` branch must end with a safe return to `main`; do not discard uncommitted work to force the switch.

## Secret handling

- Environment secret values must never be placed in this contract or diagnostic output.
- The VM's production environment files, database volume, MQTT keys, and certificate private material remain outside the repository.
- Pull request jobs do not receive Azure deployment credentials.

## Repository source

- [Workflow](../../../.github/workflows/ci-deploy.yml)
- [VM deployment script](../../../scripts/deploy-production-vm.sh)
- [Production Compose overlay](../../../compose.production.yml)
