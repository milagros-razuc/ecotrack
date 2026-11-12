# Implementation Plan: Azure deployment and CI/CD SDD reconciliation

**Branch**: `022-azure-deployment-cicd` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Audit objective and repository state at `main` (`31ba09b`), with historical deployment context from the two referenced conversations.

## Summary

Create a canonical numbered SDD record for the existing Azure environment, guarded CI/CD, backups, and their open acceptance evidence. Keep the work documentary and local. Separate implementation from production proof; do not infer live Azure/GitHub state from repository files or older conversation records.

## Technical Context

- **Primary artifacts**: `.github/workflows/ci-deploy.yml`, `scripts/deploy-production-vm.sh`, `scripts/backup-production.sh`, `docker-compose.yml`, `compose.production.yml`, `docs/deployment-environments.md`, and the legacy specifications under `docs/specs/`.
- **Existing SDD conventions**: numbered feature directory with `spec.md`, `plan.md`, `tasks.md`, `quickstart.md`, optional contracts/checklists/evidence, and requirement-to-task-to-evidence traceability.
- **Documentation scope**: this feature adds the canonical specification and traceability artifacts. Runbook reconciliation and legacy-document pointers are a later, separately approved stage.
- **Data safety**: no live credentials or secret values belong in these artifacts. No backup data or certificate private material is copied into the evidence directory.
- **Testing**: no application tests are required for this documentation-only stage. Verification is static: artifact completeness, link/reference review, status/evidence consistency, and `git diff --check`.

## Constitution Check

- Use explicit scope and acceptance criteria; do not represent implementation as observed production acceptance.
- Keep all SDD files in the numbered `specs/` tree and preserve existing numbering.
- Do not run or authorize production operations through documentation tasks.
- Keep all secrets, passwords, private keys, and private production certificates out of Git.
- Preserve the two pre-existing local ESP32 certificate changes.

## Proposed Document Layout

```text
specs/022-azure-deployment-cicd/
├── spec.md
├── plan.md
├── tasks.md
├── quickstart.md
├── contracts/
│   ├── ci-deploy.md
│   ├── backup-restore.md
│   └── domains-and-cloudflare.md
└── evidence/
    └── acceptance.md
```

The two detailed source documents under `docs/specs/` remain at their existing paths with dated notes that distinguish their original requirements from current deployment status. The operator guide keeps its existing path and carries the current operating summary. This preserves incoming links and the detailed source rationale.

The production hostname and Cloudflare operating contract is summarized in `contracts/domains-and-cloudflare.md`; the original source specification and operator guide retain their detailed environment and DNS context.

## Risks and Mitigations

- **Stale historical status**: date and label conversation evidence; never describe it as a live query.
- **Broken references during migration**: retain legacy paths until a separately reviewed link migration is prepared.
- **Numbering ambiguity**: preserve the gap at 020 and do not renumber 021; resolve feature-020 provenance before any future numbering change.
- **False recovery assurance**: leave restore acceptance pending until an isolated restore has been observed.
- **Operational side effects**: keep this plan local and documentary; production actions need separate authorization.

## Verification Plan

1. Confirm the eight SDD artifacts in this plan exist and link to the correct repository paths.
2. Check that each FR and SC has a matching task and an evidence disposition.
3. Search for the two legacy specification paths and preserve their current incoming links during this stage.
4. Run `git diff --check` and inspect the final diff; do not run application tests for this documentation-only stage.
