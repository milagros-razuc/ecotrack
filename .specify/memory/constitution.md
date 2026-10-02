<!--
Sync Impact Report
- Version change: unversioned scaffold -> 1.0.0
- Principles: I-V from README; VI (Tenant Isolation) and VII (Controlled and Auditable Access) added from requirements RNF05, RF14, RF19
- Follow-up TODOs: none
-->

# EcoTrack Constitution

## Core Principles

### I. Modular Boundaries
Each backend capability MUST keep routing, middleware, business services, persistence, and
external integrations separated according to the existing project structure. MQTT ingestion,
REST endpoints, and frontend views MUST communicate through explicit contracts rather than
reaching into another layer's implementation. This keeps sensor ingestion and user-facing
workflows independently changeable and testable.

### II. Secure By Default
Authentication, authorization, and secret handling MUST be enforced at the backend boundary.
Administrative operations MUST require the admin role, protected endpoints MUST validate the
authenticated identity, and credentials or tokens MUST NOT be committed to source control.
Client-side visibility rules MAY improve usability but MUST NOT replace backend enforcement.

### III. Validated Data Contracts
Every payload crossing an external boundary MUST be validated before it is persisted or acted
upon. MQTT readings, API request bodies, query parameters, and authentication inputs MUST use
the project's schemas and validation middleware where applicable. Validation errors MUST be
reported without storing untrusted or structurally invalid data.

### IV. Testable Changes
New business behavior MUST include focused automated tests at the service or route boundary.
Changes to shared schemas, authentication, MQTT handling, persistence, or inter-service
contracts MUST include integration coverage or an explicitly documented reason why it cannot
be exercised in the available test environment. Existing tests MUST remain passing before a
change is considered complete.

### V. Reliable and Observable Operation
Database migrations MUST be safe to run repeatedly, device connectivity and ingestion failures
MUST be diagnosable through logs or health signals, and API changes MUST preserve existing
contracts unless a breaking change is explicitly documented. Implementations MUST prefer the
smallest design that satisfies the requirement and MUST avoid speculative infrastructure.
The MQTT topic ecotrack/<deviceId>/lecturas and its payload MUST remain backward compatible with deployed firmware unless a versioned change is documented.

### VI. Tenant Isolation
Every database query, API response, and real-time event MUST be scoped to the requesting
user's cliente_id, resolved from the session token or API key and never from request input.
Alerts MUST be scoped through their device. Events from devices not assigned to a client
MUST NOT be delivered to any client. Soft deletion (activo = false, revocation) MUST be
preferred over physical deletion for devices and API keys, to preserve history and keys.

### VII. Controlled and Auditable Access
Authentication endpoints and the public API MUST be rate limited, and authentication errors
MUST NOT reveal whether a user exists. Sensitive actions (creating or deleting users,
devices, and API keys; role and password changes) MUST be recorded in the audit log.

## Security and Technology Constraints

EcoTrack uses Node.js and Express for the backend, PostgreSQL for persistence, Mosquitto for
MQTT, and static HTML/CSS/JavaScript for the frontend. Docker Compose MUST remain the
reproducible local integration environment. Secrets MUST come from environment files or local
untracked device configuration, and example files MUST contain placeholders rather than real
credentials. Passwords MUST be hashed, JWT secrets MUST be configurable, and MQTT access MUST
use authenticated broker accounts.
Socket.io for real-time dashboard updates

## Development Workflow and Quality Gates

Each change MUST identify the affected API, data, device, and authorization contracts before
implementation. The author MUST run the narrowest relevant automated tests, then the broader
backend test suite when practical, and MUST verify that no new diagnostics or exposed secrets
are introduced. API, environment, or operational behavior changes MUST be reflected in the
README or the relevant project documentation.
Requirements are defined in docs/requisitos.md. Every specification MUST cite the requirement IDs (RF, RNF, RI) it implements or changes, and MUST NOT contradict them without amending that document.

## Governance
<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

This constitution is the governing quality baseline for EcoTrack. Reviews and implementation
plans MUST check compliance with the principles above. Amendments require a documented change
to this file, an updated sync impact report, and a semantic version increment. The version uses
MAJOR for incompatible governance changes or removals, MINOR for new principles or materially
expanded obligations, and PATCH for clarifications that do not change obligations. The
constitution MUST be reviewed whenever authentication, data contracts, deployment topology, or
testing policy changes. Any unresolved TODO in this document MUST be visible in the sync impact
report and resolved before the constitution is considered fully ratified.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): original adoption date is not recorded | **Last Amended**: 2026-10-02
