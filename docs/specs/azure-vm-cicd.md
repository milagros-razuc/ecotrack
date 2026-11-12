# Specification: CI and guarded Azure VM deployment

**Status:** Implementation prepared; Azure identity and GitHub environment setup pending.
**Scope:** One public GitHub repository, one existing production VM, no staging VM.

## Goal

Every pull request and push to `main` must run the backend and frontend tests
against an isolated PostgreSQL service and validate the production Compose
configuration. Once the operator enables deployment, a successful `main` run
may update the existing Azure VM through Azure Run Command using GitHub OIDC.

## Requirements

- **CI-1:** Tests use Node 24 and a disposable PostgreSQL 15 service. The test
  database ends in `_test` and cannot point at production. The Linux runner
  excludes the Windows PowerShell fabrication test and two MQTT tests that
  require ignored, locally generated broker certificates; those remain in the
  full local `npm test` command.
- **CI-2:** The production Compose configuration is parsed using only example
  environment files and without real secrets or certificates.
- **CD-1:** Deployment stays disabled until a repository variable enables it
  and the `production` GitHub environment and Azure federation are configured.
- **CD-2:** Pull requests cannot obtain Azure deployment credentials. The job
  accepts only `main`, uses OIDC, and targets only `ecotrack-vm`.
- **CD-3:** The VM makes a verified backup before changing the checkout, then
  fast-forwards to the exact commit that passed CI, builds the backend, applies
  pending SQL migrations to the production database, rebuilds Compose services,
  and checks the origin HTTPS `/health` endpoint.
- **CD-4:** Real environment files, MQTT keys, and database data remain on the
  VM. No credential is passed through Azure Run Command or committed to Git.
- **CD-5:** A failed backup, non-fast-forward update, Compose validation,
  build, migration, or health check fails the deployment job and leaves
  diagnostic output.
- **CD-6:** The script sent through Azure Run Command executes with Bash even
  when the VM agent starts the generated file with `sh`.

## Acceptance

1. CI passes on a clean GitHub runner with a disposable database.
2. Before `DEPLOY_ENABLED=true`, `main` runs CI and skips deployment.
3. After setup, a reviewed `main` run reports the deployed SHA and a healthy
   origin; the VM checkout matches that SHA.
4. The VM keeps its existing production secrets and volumes.

## Operational constraints

Azure Run Command executes inside the VM with privileged access. Limit the
federated identity's Azure role to this VM, restrict the GitHub environment to
`main`, and require a reviewer before enabling automatic deployments. Database
migrations may not be reversible, so the workflow does not automatically roll
back a failed release. Restore from the pre-deployment backup only after
diagnosing the failure.
