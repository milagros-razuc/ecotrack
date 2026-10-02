# Feature Specification: Aislar Eventos en Tiempo Real por Cliente

**Feature Branch**: `001-aislar-eventos-cliente`

**Created**: 2026-10-02

**Status**: Draft

**Input**: User description: "/speckit.specify Aislar los eventos en tiempo real por cliente (RNF05, RI19, regla de aislamiento multi-cliente de la sección 6 de docs/requisitos.md, principio VI de la constitution). Hoy el servidor Socket.io no autentica las conexiones y transmite cada lectura y cada alerta nuevas a todos los usuarios conectados al dashboard, aunque pertenezcan a otro cliente."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recibir eventos del propio cliente (Priority: P1)

Como usuario autenticado, quiero recibir únicamente las lecturas y alertas de los dispositivos de mi cliente para consultar el estado ambiental sin exponer información de otras organizaciones.

**Why this priority**: Es el objetivo central de RNF05, RI19 y de la regla de aislamiento multi-cliente.

**Independent Test**: Con dos clientes y usuarios conectados simultáneamente, publicar lecturas y generar alertas para cada cliente y comprobar que cada usuario recibe solo los eventos de su propio cliente.

**Acceptance Scenarios**:

1. **Given** dos usuarios autenticados de clientes distintos y un dispositivo asignado al cliente A, **When** se procesa una lectura del dispositivo, **Then** solo los usuarios del cliente A reciben el evento `lectura`.
2. **Given** dos usuarios autenticados del mismo cliente y un dispositivo asignado a ese cliente, **When** se genera una alerta, **Then** ambos usuarios reciben el mismo evento `alerta`.
3. **Given** un dispositivo sin cliente asignado, **When** se procesa una lectura o se genera una alerta, **Then** ningún usuario recibe el evento.

---

### User Story 2 - Rechazar conexiones no autenticadas (Priority: P1)

Como sistema, quiero aceptar eventos en tiempo real solo para sesiones autenticadas y válidas para impedir que una conexión anónima observe datos ambientales.

**Why this priority**: Sin autenticación en la conexión no puede garantizarse el aislamiento exigido por RNF05 ni la entrega restringida de RI19.

**Independent Test**: Intentar establecer conexiones sin token, con token inválido y con token vencido, y verificar que ninguna puede recibir eventos.

**Acceptance Scenarios**:

1. **Given** una conexión sin token, **When** intenta conectarse al canal de eventos, **Then** la conexión es rechazada durante el handshake con un error de autenticación y no recibe `lectura` ni `alerta`.
2. **Given** una conexión con token inválido o vencido, **When** intenta conectarse al canal de eventos, **Then** la conexión es rechazada y no recibe eventos.
3. **Given** una sesión autenticada cuyo token deja de ser válido porque vence, cambia la contraseña, se elimina el usuario o se lo desactiva, **When** el servidor detecta la invalidez, **Then** desconecta inmediatamente el socket y no entrega eventos posteriores.
4. **Given** el dashboard recibe un rechazo o una desconexión por token inválido o vencido, **When** el navegador procesa el error de autenticación, **Then** detiene los reintentos automáticos y redirige al usuario al login.

---

### User Story 3 - Determinar el cliente desde la sesión (Priority: P1)

Como responsable de seguridad, quiero que el cliente de cada usuario se determine exclusivamente desde su sesión validada para evitar que el navegador pueda solicitar eventos de otro cliente.

**Why this priority**: La regla de aislamiento exige que el `cliente_id` provenga del token y nunca de datos enviados por el usuario.

**Independent Test**: Con una sesión del cliente A, intentar enviar o alterar cualquier identificador de cliente en los datos de conexión y comprobar que la entrega sigue limitada al cliente A.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado del cliente A, **When** conecta enviando datos adicionales que identifican al cliente B, **Then** el sistema ignora esos datos y el usuario solo recibe eventos del cliente A.
2. **Given** un usuario autenticado del cliente A, **When** un dispositivo del cliente B genera una lectura o alerta, **Then** el usuario no recibe ningún evento del cliente B.

### Edge Cases

- Token vencido o inválido al conectar: la conexión se rechaza durante el handshake con un error de autenticación y no recibe eventos.
- Dispositivo sin cliente asignado: sus lecturas y alertas no se transmiten a ningún usuario.
- Token que vence, cambia por cambio de contraseña, o queda invalidado porque el usuario es eliminado o desactivado mientras el socket sigue abierto: el servidor desconecta inmediatamente la conexión.
- El dashboard no reintenta en bucle después de un rechazo o desconexión por autenticación y envía al usuario al login.
- Varios usuarios del mismo cliente conectados: todos reciben los eventos del cliente común.
- Varios usuarios de clientes distintos conectados al mismo tiempo: ningún usuario recibe eventos de otro cliente.
- Un cliente sin usuarios conectados: sus eventos no deben quedar disponibles para conexiones de otros clientes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate each real-time connection using the existing session token before allowing it to receive events. (RNF01, RI19)
- **FR-002**: System MUST resolve the authenticated user's `cliente_id` from the validated session token and MUST NOT accept a client identifier from browser-provided connection data. (RNF05, section 6 isolation rule, Constitution VI)
- **FR-003**: System MUST deliver each `lectura` event only to authenticated users whose `cliente_id` matches the device's assigned client. (RNF05, RI19, Constitution VI)
- **FR-004**: System MUST deliver each `alerta` event only to authenticated users whose `cliente_id` matches the client assigned to the alert's device. (RNF05, RI19, Constitution VI)
- **FR-005**: System MUST deliver no real-time event for a device whose `cliente_id` is unassigned.
- **FR-006**: System MUST reject connections with missing, invalid, or expired tokens during the handshake with an authentication error, before they can receive `lectura` or `alerta` events. (RNF05, RI19)
- **FR-007**: System MUST deliver the same matching events to all concurrently connected users of the same client and MUST prevent sharing events between different clients. (RNF05, RI19, RE03)
- **FR-008**: The feature MUST preserve the existing event names and payload formats, MQTT ingestion behavior, dashboard behavior, and allowed-origin policy. (Out of scope constraints)
- **FR-009**: System MUST disconnect an already-connected socket when its token expires, its token version becomes invalid after a password change, or its user is deleted or deactivated, and MUST deliver no subsequent events to that socket.
- **FR-010**: The dashboard MUST stop automatic reconnection attempts after a real-time authentication rejection or disconnection and MUST redirect the user to the login screen. The frontend implementation details belong in the implementation plan and MUST NOT change existing event names or payloads. (RNF01, RNF05, RI19)

### Key Entities *(include if feature involves data)*

- **Authenticated session**: A user session represented by a validated token containing the user's identity, `clienteId`, and token version claim `tv`.
- **Client**: The tenant organization that owns users and devices.
- **Device**: An environmental sensor identified by a globally unique code and optionally assigned to one client.
- **Real-time event**: A `lectura` or `alerta` notification associated with a device and delivered to eligible authenticated sessions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a test with at least two clients, 100% of generated `lectura` and `alerta` events are delivered to every connected authenticated user of the owning client and to 0 users of other clients.
- **SC-002**: In a test with unauthenticated, invalid-token, and expired-token connections, 0 protected real-time events are received by those connections.
- **SC-003**: In a test with an unassigned device, 0 connected users receive events generated for that device.
- **SC-004**: In a concurrency test with users from at least three clients connected at once, no event is observed by a user outside the owning client across all test events.
- **SC-005**: Existing event names and payload fields remain unchanged, and MQTT ingestion and dashboard behavior continue to pass their existing tests.

## Assumptions

- The existing login flow emits the authenticated user's `clienteId` and token version as `tv`; the authentication middleware verifies the JWT expiration and compares `tv` with the current `usuarios.token_version` value. The plan MUST reuse or explicitly adapt these same checks for real-time connections rather than assuming literal claim names `cliente_id` or `token_version`.
- Device ownership is resolved from the persisted device identified by its globally unique code; the browser cannot select ownership.
- The existing `lectura` and `alerta` event payload formats are contractual and remain unchanged.
- CORS/origin restrictions, MQTT ingestion, the existing dashboard (CU03), API keys, rate limiting, and device claims are outside this feature.
- A token becoming invalid because of expiry, password change, user deletion, or user deactivation is handled by disconnecting the socket; the dashboard handles the resulting authentication error by stopping retries and redirecting to login.
