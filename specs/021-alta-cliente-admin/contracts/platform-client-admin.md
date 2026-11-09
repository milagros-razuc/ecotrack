# Platform Client/Admin Contracts

All routes require the existing raw JWT in `Authorization` and `platform_admin`.
JSON errors are sanitized and never contain constraint names, hashes, or passwords.

## Create client and initial admin

`POST /api/plataforma/clientes`

Request:

```json
{
  "nombre_cliente": "Acme",
  "username": " AdminPrincipal ",
  "nombre_admin": " Ana ",
  "motivo": "Alta comercial"
}
```

The service trims all three names, lowercases `username`, validates existing length
rules, and rejects extra fields.

Success `201`:

```json
{
  "cliente": { "id": 42, "nombre": "Acme" },
  "usuario": { "id": 77, "username": "adminprincipal", "nombre": "Ana", "rol": "admin" },
  "password_temporal": "one-time-value"
}
```

The password is shown only in the immediate modal response and is not returned later.

## Create initial admin for an existing client

`POST /api/plataforma/clientes/:id/admin`

Request:

```json
{
  "username": " AdminPrincipal ",
  "nombre_admin": " Ana ",
  "motivo": "Completar alta"
}
```

The client id comes only from the route. `cliente_id` in the body is rejected.
Success uses the same allowlisted user and one-time password fields.

## Error contract

| Condition | HTTP | Application code |
|---|---:|---|
| Missing/invalid session | 401 | Existing authentication error |
| Non-platform role | 403 | Existing platform authorization error |
| Invalid/extra fields | 400 | Validation error |
| Client name conflict | 409 | `CLIENT_NAME_TAKEN` |
| Username conflict | 409 | `USERNAME_TAKEN` |
| Reserved normalized name | 409 | Sanitized reserved-name error |
| Existing client already has admin | 409 | Sanitized conflict error |
| Persistence/audit failure | 500 | Generic sanitized error |
| Per-user creation limit exceeded | 429 | Existing rate-limit error |

## First login and password change

`POST /api/auth/login` returns `200` with existing session fields plus a forced-change
indicator when the persisted account marker is pending. The server allows only
`GET /api/auth/me` and `POST /api/auth/change-password` for that session; operational,
tenant, platform, and administrative routes are rejected after checking the marker.

`POST /api/auth/change-password` clears the marker and increments `token_version`.
The frontend displays only the forced-change screen until success, then replaces the
session with the returned token or requires a fresh login.
