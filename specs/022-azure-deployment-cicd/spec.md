# Feature Specification: Azure deployment and CI/CD

**Feature Branch**: `022-azure-deployment-cicd`
**Created**: 2026-11-12
**Status**: Draft
**Input**: Read-only audit of EcoTrack's Azure production environment, backups, and GitHub Actions deployment against the repository's SDD conventions.

## Purpose and status convention

This feature records the intended production operating contract and the observed state. It does not itself authorize a production change. Each criterion must be classified as **met**, **partially met**, **pending**, or **not evidenced**; implementation in the repository alone does not prove that a production operation succeeded.

The audit used the repository at `main` (`31ba09b`) and the histories of «Planificar despliegue en Azure» (`01a1c38b-adf1-7bf3-9677-175fcd685475`) and «Pendientes EcoTrack — Azure y ESP32» (`01a1cdcc-7f67-7b20-b703-93c9194d614a`). Historical production statements are labelled with their source and date in `evidence/acceptance.md`. They are not live Azure or GitHub queries.

Detailed source requirements are retained in [the original environment specification](../../docs/specs/azure-deployment-environments.md) and [the original CI/CD specification](../../docs/specs/azure-vm-cicd.md). This SDD record consolidates their current acceptance status and open evidence; those source documents remain useful for the original network, TLS, Compose, CI, and operational rationale.

## User Scenarios & Testing

### User Story 1 - Maintain a reproducible production environment (Priority: P1)

As an EcoTrack maintainer, I need local and production Compose configurations to be explicit and separate, so local work cannot silently change production networking, secrets, or persistent data.

**Why this priority**: The same repository supports developer work and the live service.

**Independent Test**: Parse the local and production Compose selections using example environment files, confirm the intended published ports, and confirm PostgreSQL data uses a named volume.

**Acceptance Scenarios**:

1. **Given** the production Compose selection, **When** it is inspected, **Then** only Caddy ports 80/443 and Mosquitto 8883 are published, while PostgreSQL and application internals remain on the Compose network.
2. **Given** a local Compose selection, **When** it is inspected, **Then** it uses local configuration and does not implicitly load a production override.
3. **Given** repository example configuration, **When** a maintainer prepares a local or production environment, **Then** no real credentials or private keys are committed.
4. **Given** the production hostnames, **When** DNS and TLS are configured, **Then** `app.ecotrack.ar` serves the web application/API and `mqtt.ecotrack.ar` supports HTTPS enrolment and direct MQTT/TLS access using the Cloudflare proxy policy in the network contract.

### User Story 2 - Deploy a reviewed commit through guarded CI/CD (Priority: P1)

As a maintainer, I need pull requests and `main` to receive automated checks and production deployment to require a reviewed, tested commit, so a release has a traceable SHA and a health check.

**Why this priority**: Production changes affect the live service and its database.

**Independent Test**: Observe a CI run against a disposable PostgreSQL database; for a production run, verify the approved `main` commit SHA, deployment result, VM branch, and origin health check.

**Acceptance Scenarios**:

1. **Given** a pull request, **When** the workflow runs, **Then** CI has no production deployment credentials and does not deploy.
2. **Given** an eligible `main` commit and a passing CI job, **When** deployment is enabled, **Then** the protected `production` environment gates OIDC-authenticated Azure Run Command.
3. **Given** a deployment, **When** the VM script runs, **Then** it verifies the VM checkout is on `main`, backs up before updating, deploys the exact tested commit (including a clean reset when local `main` has diverged), applies migrations, rebuilds services, and confirms origin HTTPS health for that SHA.
4. **Given** a temporary VM test on another branch, **When** the test ends, **Then** the production checkout is returned to `main` without discarding uncommitted work.
5. **Given** a failed backup, update, migration, build, or health check, **When** deployment exits, **Then** the failure is visible and no automatic database rollback is claimed.

### User Story 3 - Produce backups and demonstrate recoverability (Priority: P1)

As an operator, I need PostgreSQL and Mosquitto Dynamic Security backups, a defined retention policy, and a separately tested restore, so I can assess whether production data can be recovered.

**Why this priority**: A database-only restore would not recover the broker's device clients and ACLs.

**Independent Test**: Verify a completed backup pair in Blob; then restore PostgreSQL into an isolated database and validate Dynamic Security JSON without replacing production state.

**Acceptance Scenarios**:

1. **Given** a scheduled backup, **When** it runs, **Then** PostgreSQL's archive and Mosquitto Dynamic Security JSON are validated and uploaded using the VM's managed identity.
2. **Given** a configured retention policy, **When** its lifecycle period elapses, **Then** expired backup objects are removed according to the approved retention decision.
3. **Given** a selected backup pair, **When** an isolated restore is performed, **Then** PostgreSQL content and Dynamic Security structure are validated without changing production data.
4. **Given** backup execution, **When** local or remote storage approaches its configured limits, **Then** operators have a documented way to detect and address it.

## Requirements

### Functional Requirements

- **FR-001**: The repository MUST keep local and production Compose selections explicit and keep production secrets, private certificates, and persistent data outside source control.
- **FR-002**: CI MUST use an isolated PostgreSQL test database and MUST validate the production Compose configuration without production secrets.
- **FR-003**: Production deployment MUST be restricted to `main`, use OIDC and the protected `production` environment, and target only the configured production VM.
- **FR-004**: Deployment MUST back up before changing the VM checkout, deploy the exact tested commit, apply pending migrations, rebuild services, and check origin HTTPS health.
- **FR-005**: The production VM checkout MUST be on `main` after temporary tests; the operating procedure MUST preserve uncommitted work rather than discard it to switch branches.
- **FR-006**: Automated backups MUST include both PostgreSQL and Mosquitto Dynamic Security state and validate each artifact before upload.
- **FR-007**: The production backup policy MUST specify Azure Blob and local-disk retention, and recoverability MUST be demonstrated with an isolated restore before it is claimed.
- **FR-008**: Evidence MUST distinguish repository implementation, successful workflow execution, production state observed at a point in time, and work still pending.
- **FR-009**: This feature's audit and documentation work MUST NOT modify Azure resources, GitHub production settings, or the production VM without separate authorization.
- **FR-010**: ESP32 enrolment and authenticated MQTT acceptance MUST remain a separately tracked, deferred deployment validation; this SDD feature MUST preserve the existing local certificate edits.
- **FR-011**: Production DNS and TLS documentation MUST identify `app.ecotrack.ar` as the web/API hostname and `mqtt.ecotrack.ar` as the device-enrolment and MQTT hostname, including their Azure VM target and Cloudflare proxy policy.
- **FR-012**: Documentation MUST distinguish the intended Cloudflare/DNS policy from live DNS, proxy, and certificate state; the latter MUST be marked unverified until checked from an authorized read-only source.

### Key Entities

- **Release**: A Git commit that passed the required CI checks and may be deployed to the production VM.
- **Production VM checkout**: The repository branch and SHA present on the production VM; it must satisfy the `main` operating rule.
- **Backup pair**: A PostgreSQL custom-format archive and Mosquitto Dynamic Security JSON from the same scheduled backup run.
- **Acceptance evidence**: A dated reference to an observed test, workflow execution, repository state, or operator confirmation.

## Success Criteria

- **SC-001**: A reviewer can trace every requirement to a repository artifact, a dated evidence record, and a task state.
- **SC-002**: The deployment evidence records the workflow run, tested SHA, approval outcome, VM SHA/branch, and health result without exposing credential values.
- **SC-003**: PostgreSQL and Mosquitto Dynamic Security restore acceptance is marked met only after a restore into an isolated target is observed.
- **SC-004**: Azure Blob retention acceptance is marked met only after the policy and its effective scope are verified.
- **SC-005**: Temporary VM testing instructions explicitly finish with a clean, safe return to `main`.
- **SC-006**: A maintainer can identify each production hostname's purpose, Azure target, Cloudflare proxy mode, and TLS route from the SDD and runbook; current DNS/proxy status is claimed only when live evidence is recorded.

## Assumptions and Dependencies

- Production consists of one Ubuntu VM in Azure for Students and one public GitHub repository; no staging VM is in scope.
- The production Compose services are PostgreSQL, Node backend, nginx frontend, Caddy, and Mosquitto with TLS.
- The workflow uses GitHub Actions, Azure OIDC, the protected `production` environment, and Azure Run Command.
- Current Azure/GitHub/Cloudflare settings and the VM's present SHA require live read-only verification before being described as current; Cloudflare's current DNS/proxy state was not checked in this audit.
- Retention duration, local disk retention, and any off-region copy policy require an explicit operational decision.

## Out of Scope

- Changing or deploying Azure resources, GitHub settings, workflow configuration, or production application state as part of this audit.
- Performing the deferred production restore, configuring retention, or running ESP32 Deploy.
- Changing or regenerating the local ESP32 CA files present in the working tree.
- Renumbering existing specs or assuming that missing `020` is available for reuse.
