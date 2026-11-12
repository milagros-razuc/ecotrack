# Tasks: Azure deployment and CI/CD SDD reconciliation

**Source**: [spec.md](spec.md) and [plan.md](plan.md)
**State convention**: `[X]` means this documentary audit item was completed in this checkout; `[ ]` is open or deferred. A checked task does not assert that a production acceptance criterion passed.

## Phase 1: Read-only inventory

**Purpose**: Record the repository implementation and historical operational context without changing production.

- [X] T001 Inventory the numbered SDD directories, templates, traceability documents, Azure guides, Compose files, scripts, workflow, and relevant tests.
- [X] T002 Read the deployment-planning and Azure/ESP32 pending threads; distinguish their dated operational records from current repository evidence.
- [X] T003 Inspect local branch, origin-tracking branch, recent commits, and preserve the existing ESP32 certificate edits.
- [X] T004 Record implementation evidence for Compose, CI, deploy, and backup contracts in `contracts/`.
- [X] T005 Record completed, pending, deferred, and not-live-verified criteria in `evidence/acceptance.md`.

## Phase 2: Documentation reconciliation (requires separate approval)

**Purpose**: Bring the operator guide and legacy specification pointers into alignment with the canonical SDD record.

- [X] T006 Update `docs/deployment-environments.md` so completed CI/OIDC setup is not presented as future setup, while retaining pending retention and restore work.
- [X] T007 Retain the detailed requirements in both `docs/specs/` source documents, add pointers to the current SDD status, and retain their paths for incoming links.
- [X] T008 Search the full repository for links and mentions of the two legacy docs; repair any reference made obsolete by reconciliation.

## Phase 3: Operational evidence and closeout (requires evidence and separate approval)

**Purpose**: Close only criteria with observable evidence and keep operational work separated from this documentation audit.

- [X] T009 Verify the latest workflow run and production VM branch/SHA using read-only sources; record that current GitHub environment protection settings are not available from the unauthenticated API.
- [ ] T010 Record Blob retention policy and local-disk retention only after the operator's retention decision and policy verification.
- [ ] T011 Record PostgreSQL and Mosquitto Dynamic Security restore acceptance only after an isolated restore and validation have been observed.
- [X] T012 Keep ESP32 enrolment and authenticated MQTT production acceptance deferred until separately scheduled and approved; preserve local certificate changes.
- [X] T013 Update acceptance evidence and task states without exposing secrets or credentials.
- [X] T014 Record the production hostnames, Cloudflare proxy policy, and verification boundary in `spec.md` and `contracts/domains-and-cloudflare.md`.
- [X] T015 Link the domain contract from the operator guide and acceptance evidence; leave live DNS/proxy verification open until observed.

## Completion Rules

- A workflow file or a green historical run alone does not prove current VM state.
- Backup upload and archive/JSON format checks do not prove restore recoverability.
- Do not mark a task complete from an assumption or a planned command.
- Every production verification records date, target, result, and safe evidence reference; omit credential values.
- The production VM checkout is returned to `main` after any authorized temporary test.
