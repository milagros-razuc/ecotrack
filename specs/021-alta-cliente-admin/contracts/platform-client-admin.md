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

`POST /api/auth/change-password` rejects a new password equal to the temporary
password, clears the persisted marker, increments `token_version`, and returns a
new JWT containing the updated `tv`. The frontend replaces its session token with
that returned JWT and continues without a second login.

## Socket.IO pending-password contract

The existing Socket.IO handshake middleware in `backend/index.js` continues to
validate the JWT and current `tv`, then checks the persisted forced-change marker.
For a pending account it rejects using the same error shape as current handshake
rejections and sets `error.data.code` to `PASSWORD_CHANGE_REQUIRED`.

The frontend `connect_error` handler must treat that code specially: disable
reconnection, keep the current token, and redirect to the forced-change screen.
It must not call `cerrarSesion()` or delete the token. Other error codes retain the
existing `shouldEndSession` behavior.
