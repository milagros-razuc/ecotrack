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

This procedure is for production. Recreate the dump immediately before the real
deployment; do not reuse a test or stale dump. Store it outside the repository
and do not place a password in the command line or documentation:

```powershell
docker exec ecotrack_db pg_dump -U ecotrack_user -Fc -f /tmp/ecotrack-before-020.dump ecotrack
docker cp ecotrack_db:/tmp/ecotrack-before-020.dump C:\secure-backups\ecotrack-before-020.dump
```

Run both duplicate checks against production and stop to resolve any returned rows:

```powershell
docker exec ecotrack_db psql -U ecotrack_user -d ecotrack -c @'
SELECT lower(nombre) AS nombre_normalizado, COUNT(*)
FROM clientes
GROUP BY lower(nombre)
HAVING COUNT(*) > 1;
'@

docker exec ecotrack_db psql -U ecotrack_user -d ecotrack -c @'
SELECT lower(username) AS username_normalizado, COUNT(*)
FROM usuarios
GROUP BY lower(username)
HAVING COUNT(*) > 1;
'@
```

Only after both queries return no rows, apply `020_client_admin.sql`. The
migration is transactional and also repeats these checks, so it aborts without
creating the indexes or marker when historical collisions remain.

If the migration runner records applied versions in `schema_migrations` (or an
equivalent table), remove the row for `020_client_admin` as part of either
rollback path so the migration can be reapplied deliberately.

### Rollback 1: schema-only (preferred)

Stop application writes, revert the code for Feature 021 first, and only then
remove the migration's schema objects:

```sql
DROP INDEX uq_usuarios_username_lower;
DROP INDEX uq_clientes_nombre_lower;
ALTER TABLE usuarios DROP COLUMN must_change_password;
```

Do not run this schema rollback while Feature 021 code is deployed: doing so
breaks login because the deployed code expects `must_change_password`.

### Rollback 2: complete restore

Use a complete restore only if the schema is damaged. It loses all data written
after the backup was taken, so stop writes and confirm the data-loss impact
before proceeding:

```powershell
docker cp C:\secure-backups\ecotrack-before-020.dump ecotrack_db:/tmp/ecotrack-before-020.dump
docker exec ecotrack_db pg_restore --clean --if-exists -U ecotrack_user -d ecotrack /tmp/ecotrack-before-020.dump
```

After either rollback, verify the application and schema before reopening writes.
Do not remove `020_client_admin.sql` or edit an applied migration; future
corrections require a new numbered migration.

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
