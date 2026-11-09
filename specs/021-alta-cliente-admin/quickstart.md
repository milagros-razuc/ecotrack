# Feature 021 Validation Quickstart

## Prerequisites

- Node.js and backend dependencies installed.
- PostgreSQL test database URL in `TEST_DATABASE_URL`.
- The URL points to a database ending in `_test` or `hardening_*`.
- No production or development credentials are copied into test fixtures.

## Prepare an isolated database

The integration helper creates a temporary database from `TEST_DATABASE_URL` and
applies the base initializer plus numbered migrations. The migration run must be
repeatable and include the forced-password-change column and case-insensitive unique
indexes.

## Deploy migration 020 safely

Before applying the migration, create a custom-format backup without placing a
password in the command line or documentation:

```powershell
pg_dump --format=custom --file=ecotrack-before-020.dump --dbname="$env:TEST_DATABASE_URL"
```

Run both duplicate checks and stop to resolve any returned rows:

```sql
SELECT lower(nombre) AS nombre_normalizado, COUNT(*)
FROM clientes
GROUP BY lower(nombre)
HAVING COUNT(*) > 1;

SELECT lower(username) AS username_normalizado, COUNT(*)
FROM usuarios
GROUP BY lower(username)
HAVING COUNT(*) > 1;
```

Only after both queries return no rows, apply `020_client_admin.sql`. The
migration is transactional and also repeats these checks, so it aborts without
creating the indexes or marker when historical collisions remain.

If a post-deployment rollback is required, stop application writes and restore the
backup taken immediately before deployment:

```powershell
pg_restore --clean --if-exists --dbname="$env:TEST_DATABASE_URL" ecotrack-before-020.dump
```

Then verify the application and schema before reopening writes. Do not remove
`020_client_admin.sql` or edit an applied migration; future corrections require a
new numbered migration.

## Focused validation

From `backend`:

```powershell
node --test --test-name-pattern="Feature 021|cliente|admin inicial|primer login|normalización" src/test/platform-client-admin.integration.test.js
```

Expected outcomes:

1. A valid platform-admin request creates one client, one admin, one audit row, and
   returns the normalized username plus one temporary password.
2. The persisted password is bcrypt-verifiable but plaintext is absent from audit
   rows, logs, later reads, and error responses.
3. `Acme`/`acme`, `Admin`/`admin`, reserved values, edge spaces, invalid payloads,
   and duplicate usernames produce the documented outcome without partial rows.
4. The sixth request in a 15-minute window returns 429 for one platform admin while
   another platform admin has an independent counter.
5. A temporary-password login returns a restricted session; operational requests are
   rejected until `change-password` clears the persisted marker and increments
   `token_version`; the returned JWT is used without a second login.
6. A pending user is rejected by the Socket.IO handshake with
   `error.data.code = PASSWORD_CHANGE_REQUIRED`; the client disables reconnection,
   preserves the token, and redirects to password change.

## Frontend mutation checks

Run the modal test and apply each mutation independently to the modal source:

```powershell
node --test --test-name-pattern="Feature 021 frontend" src/test/platform-client-admin.test.js
```

The test must fail when token/username assignment stops using `textContent`, when
the password or result variables are not cleared on close, or when the copy action
disappears. Existing table/summary rendering from Feature 018 is outside this
modal-only assertion.
