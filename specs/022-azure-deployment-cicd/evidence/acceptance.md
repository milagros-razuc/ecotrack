# Acceptance evidence: Azure deployment and CI/CD

**Audit date**: 2026-11-12
**Repository checkout**: `main` at `31ba09b` (`origin/main` at the same commit in this checkout)
**Evidence boundary**: repository inspection, the two named conversation histories, a read-only GitHub public API query, and a read-only SSH check of the VM on 2026-11-12. No secrets or credential values were read. GitHub's unauthenticated API did not expose the current `production` environment policy, so its reviewer/branch rules and the current `DEPLOY_ENABLED` value are not asserted here.

## Evidence sources

- Repository artifacts linked from [spec.md](../spec.md), especially the workflow, deployment script, backup script, and production Compose files.
- Conversation «Planificar despliegue en Azure» (`01a1c38b-adf1-7bf3-9677-175fcd685475`). It records the successful workflow #6 for `9fd27f0`, a clean VM checkout on `main`, the platform-admin sign-in/password-change confirmation, and the later publication of `31ba09b`.
- Conversation «Pendientes EcoTrack — Azure y ESP32» (`01a1cdcc-7f67-7b20-b703-93c9194d614a`). Its 2026-11-12 updates record backup execution/upload, the deferred restore and ESP32 work, and Blob retention as pending.
- [Workflow run #6](https://github.com/milagros-razuc/ecotrack/actions/runs/43155066867), recorded in the deployment conversation as successful.
- [Workflow run #7](https://github.com/milagros-razuc/ecotrack/actions/runs/43156828972), read from GitHub's public API: `main`, SHA `31ba09b484b479ee380724df2c7fb2b29f3160f9`, completed successfully at `2026-11-12T04:47:58Z`. Both `test` and `deploy` succeeded; the Azure OIDC sign-in and VM deployment steps succeeded.
- [GitHub `main` commit](https://github.com/milagros-razuc/ecotrack/commit/31ba09b484b479ee380724df2c7fb2b29f3160f9), read from GitHub's public API; commit time `2026-11-12T04:43:20Z`.
- Read-only SSH check of the VM during this audit: checkout was clean on `main` at `31ba09b484b479ee380724df2c7fb2b29f3160f9`, matching GitHub `main`; all five EcoTrack containers were `Up`, PostgreSQL was `healthy`, and origin `/health` returned `{"ok":true}`.
- Read-only `GET` of the public GitHub environment endpoint returned HTTP 404 without authentication. This does not mean the environment is absent; it means current protection rules could not be verified through that endpoint without credentials.
- The original environment specification and operator guide describe `app.ecotrack.ar`, `mqtt.ecotrack.ar`, and the intended Cloudflare/DNS/TLS behavior. Current Cloudflare DNS records, proxy modes, and live certificate routing were not queried during this audit.

## Acceptance disposition

| Requirement / criterion | Disposition on 2026-11-12 | Evidence and limitation |
|---|---|---|
| FR-001 / SC-005: explicit Compose configuration and VM `main` operating rule | **Implemented; current VM state verified** | Production overlay publishes `8883`, `80`, and `443`; deployment script rejects a non-`main` checkout. Read-only SSH confirmed a clean VM checkout on `main` at `31ba09b484b479ee380724df2c7fb2b29f3160f9`, matching GitHub `main`. |
| FR-002: isolated CI database and production Compose validation | **Verified in latest workflow** | Run #7 completed successfully; its disposable PostgreSQL, backend/frontend tests, and production Compose/shell validation steps succeeded. |
| FR-003 / SC-002: guarded OIDC production deployment | **Latest deploy succeeded; protection policy partly unverified** | Run #7's deploy job, Azure OIDC sign-in, and VM deployment steps succeeded for `main` SHA `31ba09b484b479ee380724df2c7fb2b29f3160f9`. The unauthenticated API did not expose current environment protection rules, reviewer policy, or `DEPLOY_ENABLED`; no current approval-policy claim is made. |
| FR-004: pre-deploy backup, exact tested SHA, migrations, rebuild, origin health | **Latest deployment verified** | Run #7's deploy step succeeded; read-only VM check confirmed the same SHA, all five containers up, PostgreSQL healthy, and origin `/health` returned `{"ok":true}`. The workflow output did not independently verify backup contents or prove restore. |
| FR-006: PostgreSQL and Mosquitto Dynamic Security backup validation/upload | **Implemented; execution historically reported** | Backup script validates archive and JSON before upload. Pending-list thread records a daily run and uploaded pair on 2026-11-12. This is not restore evidence. |
| FR-007 / SC-003: isolated restore acceptance | **Pending** | The pending-list conversation explicitly defers isolated PostgreSQL and Mosquitto Dynamic Security restoration. No restore evidence was found in the reviewed repository inventory. |
| FR-007 / SC-004: Azure Blob and local retention | **Pending** | The operator guide says no automatic retention is configured; the pending-list conversation repeats this. No effective policy was verified. |
| FR-008: traceable, dated acceptance evidence | **Met for this audit; live policy detail unavailable** | This file links repository evidence, dated conversations, latest public workflow metadata, and the read-only VM check. The GitHub environment policy remains explicitly unverified. |
| FR-009: audit remains read-only | **Met for this audit** | GitHub was queried with read-only GET requests and the VM with read-only SSH commands. No Azure/GitHub configuration or production files were changed; no application tests were run. |
| FR-010: ESP32 deployment validation | **Deferred** | The pending-list conversation defers LAN enrolment and authenticated production MQTT. The two local CA files remain modified and were not changed by this feature. |
| FR-011 / SC-006: production hostnames and Cloudflare policy documented | **Documented; live configuration unverified** | [`domains-and-cloudflare.md`](../contracts/domains-and-cloudflare.md) records the purpose and intended DNS/proxy/TLS route for both names. It does not assert the present Cloudflare record or proxy state. |
| FR-012: distinguish intended policy from observed DNS/proxy state | **Met for this audit** | This evidence file states that Cloudflare DNS/proxy settings and live certificate routing were not queried. |
| Platform-admin bootstrap and login | **Completed per conversation; current code deployed** | The deployment conversation records successful login and password change. The `bootstrap-platform-admin` commit is in `main`, and the read-only VM check confirms that `31ba09b` is deployed. |

## Open evidence needed

1. Authenticated read-only confirmation of GitHub `production` environment protection, reviewer/branch policy, and `DEPLOY_ENABLED`; the unauthenticated public endpoint returned 404.
2. Chosen Blob and local disk retention periods plus confirmation of the effective Azure lifecycle policy.
3. Dated isolated restore evidence for PostgreSQL and Mosquitto Dynamic Security.
4. Separate ESP32 enrolment and authenticated MQTT evidence when that deferred work is resumed.
5. Read-only verification of Cloudflare A records, proxy modes, and public TLS routing for both hostnames.

The VM branch/SHA and health state above are verified as of this audit. Recheck them after any later deployment or temporary VM test; the checkout must finish on `main`.
