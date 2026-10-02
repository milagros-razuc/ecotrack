# Quickstart: Validar aislamiento de eventos

## Prerequisites

- Docker Desktop running.
- Project environment files configured as described in `README.md`.
- MQTT credentials configured for the backend.
- Two clients with at least one user and one assigned device each.
- One device record with `cliente_id = NULL` for the unassigned-device case.

## Start the system

```bash
docker compose up --build
```

Open the dashboard at `http://localhost:8080/login.html` in separate browser sessions or
profiles. Use one user from client A and one user from client B.

## Validation scenarios

1. **Client isolation**
   - Connect users from clients A and B at the same time.
   - Publish a valid reading to `ecotrack/<deviceA>/lecturas`.
   - Confirm every connected user of A receives one unchanged `lectura` payload and no user of B
     receives it.
   - Repeat for a device of B.

2. **Same-client fanout**
   - Connect two users from client A.
   - Generate a threshold breach for a device of A.
   - Confirm both sessions receive the same unchanged `alerta` payload.

3. **Unassigned device**
   - Publish a valid reading for a device whose `cliente_id` is NULL.
   - Confirm no connected session receives `lectura` or an alert generated from that reading.

4. **Handshake rejection**
   - Attempt a Socket.IO connection without a token, with a malformed token, and with an
     expired token.
   - Confirm each attempt fails during handshake with an authentication error and receives no
     events.

5. **Session invalidation**
   - Keep a user connected in two browser tabs.
   - Change that user's password or delete/deactivate the user from an authorized session.
   - Confirm both sockets disconnect and no later event reaches them.
   - Confirm the dashboard stops reconnection attempts and redirects to `login.html`.

6. **Expiry timer cleanup**
   - Connect with a valid short-lived test token or a controlled expiry fixture.
   - Confirm the socket disconnects at `exp` and that disconnecting earlier leaves no active timer
     or user-index entry.

## Automated validation

After implementation, run the backend's configured test command from `backend/`. The integration
suite must cover the scenarios above with at least two clients and concurrent sockets. It must
also assert that existing event names and payload fields remain unchanged.
