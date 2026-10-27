# Feature Specification: Aislamiento histórico al transferir un dispositivo

**Feature Branch**: `003-aislamiento-historico-dispositivo`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Aislamiento histórico al transferir un dispositivo entre clientes (RNF18). Problema: lecturas y alertas se asignan a un cliente por JOIN con el dueño actual del dispositivo. Si el dispositivo pasa de A a B, B ve el histórico de A. Cada lectura y alerta pertenece al cliente que era dueño del dispositivo cuando se generó, y eso no cambia si el dispositivo se transfiere. Tras la baja de A y el reclamo de B, B solo ve datos generados desde su reclamo; A conserva lo suyo. Los datos de un dispositivo sin dueño se descartan. Los umbrales del dispositivo se eliminan cuando queda sin dueño. La baja deja el dispositivo sin dueño para que otro cliente pueda reclamarlo. Fuera de alcance: credenciales por dispositivo, ACL, TLS y token de reclamo. Criterio de aceptación: A tiene dispositivo con datos, A lo da de baja, B lo reclama, B no ve nada anterior y A conserva todo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conservar la pertenencia histórica de los datos (Priority: P1)

Como cliente que administra un dispositivo, quiero que cada lectura y alerta quede vinculada al cliente que era dueño del dispositivo cuando se generó, para que una transferencia posterior no modifique mi historial.

**Why this priority**: Es la protección central de privacidad y trazabilidad de RNF18 y evita que una transferencia exponga datos históricos a otro cliente.

**Independent Test**: Con un dispositivo de A que tenga lecturas y alertas, transferirlo a B y consultar los datos desde ambos clientes. A debe conservar todos sus datos y B no debe recibir ninguno generado antes de su reclamo.

**Acceptance Scenarios**:

1. **Given** un dispositivo perteneciente a A con lecturas y alertas existentes, **When** B reclama el dispositivo después de la baja de A, **Then** A sigue viendo sus lecturas y alertas y B no ve ningún dato anterior al reclamo.
2. **Given** un dispositivo perteneciente a B, **When** se genera una nueva lectura o alerta, **Then** ese dato pertenece a B aunque el dispositivo haya tenido otro dueño anteriormente.

---

### User Story 2 - Transferir un dispositivo sin arrastrar datos al nuevo cliente (Priority: P1)

Como administrador de A, quiero dar de baja un dispositivo dejando su asociación disponible para otro cliente, para que B pueda reclamarlo sin acceder a información de A.

**Why this priority**: El flujo de baja y reclamo es el caso de aceptación principal y debe permitir la reutilización del dispositivo sin romper el aislamiento entre clientes.

**Independent Test**: Crear el dispositivo para A, registrar datos, ejecutar la baja, reclamarlo desde B y verificar el estado del dispositivo, la visibilidad de datos y la posibilidad de generar nuevos datos.

**Acceptance Scenarios**:

1. **Given** un dispositivo asignado a A, **When** A realiza la baja, **Then** el dispositivo queda sin dueño y puede ser reclamado por otro cliente.
2. **Given** un dispositivo sin dueño, **When** B lo reclama, **Then** queda asignado a B desde el momento del reclamo y B no obtiene acceso a datos previos.
3. **Given** un dispositivo que A dio de baja, **When** B intenta reclamarlo, **Then** la operación es aceptada si cumple las reglas vigentes de reclamación y el dispositivo no conserva la asociación activa con A.

---

### User Story 3 - Aislar todos los canales de consulta y notificación (Priority: P1)

Como usuario de un cliente, quiero que el aislamiento histórico se aplique en el dashboard, las alertas, la API pública y las actualizaciones en tiempo real, para que ningún canal revele datos de otro cliente.

**Why this priority**: El aislamiento no es efectivo si un canal alternativo permite consultar o recibir el historial anterior.

**Independent Test**: Después de transferir el dispositivo de A a B, consultar histórico, alertas, API pública y eventos en tiempo real con usuarios y credenciales de ambos clientes.

**Acceptance Scenarios**:

1. **Given** un dispositivo reclamado por B con historial anterior de A, **When** un usuario de B consulta histórico o alertas, **Then** solo recibe datos generados desde el reclamo de B.
2. **Given** un dispositivo reclamado por B, **When** se consulta la API pública autorizada de B, **Then** la respuesta contiene solo datos de B y no incluye lecturas ni alertas anteriores.
3. **Given** usuarios conectados de A y B, **When** el dispositivo genera un dato después del reclamo de B, **Then** solo los usuarios de B reciben el evento correspondiente; los usuarios de A no reciben datos nuevos del dispositivo transferido.
4. **Given** datos históricos de A, **When** A consulta su histórico y alertas, **Then** A conserva el acceso a todos sus datos aunque el dispositivo actualmente esté sin dueño o pertenezca a B.

---

### User Story 4 - Reiniciar la configuración de umbrales al liberar el dispositivo (Priority: P2)

Como administrador de un cliente, quiero que los umbrales se eliminen cuando un dispositivo queda sin dueño, para que el siguiente cliente no herede reglas de alertas configuradas por el anterior.

**Why this priority**: Los umbrales pueden generar alertas y notificaciones con reglas que ya no representan al nuevo cliente.

**Independent Test**: Configurar umbrales para A, dar de baja el dispositivo y comprobar que no quedan umbrales activos antes de que B lo reclame.

**Acceptance Scenarios**:

1. **Given** un dispositivo de A con umbrales configurados, **When** A lo da de baja, **Then** todos los umbrales del dispositivo se eliminan y no generan alertas mientras no tenga dueño.
2. **Given** un dispositivo reclamado por B sin umbrales heredados, **When** B configura nuevos umbrales, **Then** solo las reglas configuradas por B se evalúan para los datos generados desde su reclamo.

### Edge Cases

- Si un dato llega mientras el dispositivo no tiene dueño, el sistema lo descarta: no queda disponible en histórico, no genera alerta y no se emite por tiempo real ni por la API pública.
- Si la baja ocurre entre la recepción de una lectura y la generación de una alerta, la lectura y la alerta se asignan de forma consistente al dueño vigente en el instante en que se generaron; ningún dato sin dueño se conserva.
- Si el dispositivo se transfiere varias veces, cada cliente conserva únicamente los datos generados durante su propio período de pertenencia.
- Si A da de baja un dispositivo sin datos, la operación igualmente debe dejarlo sin dueño y eliminar cualquier umbral existente.
- Si B intenta consultar un dato anterior a su reclamo usando filtros, identificadores o rangos de fechas, la respuesta no debe revelarlo ni permitir inferir su existencia.
- Si un dispositivo sin dueño no tiene clientes conectados, ningún dato descartado debe aparecer posteriormente al reclamarlo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST assign each reading to the client that owned the device at the moment the reading was generated, and that assignment MUST remain unchanged after later transfers. (RNF18, RF05, RF18)
- **FR-002**: System MUST assign each alert to the client that owned the device at the moment the alert was generated, and that assignment MUST remain unchanged after later transfers. (RNF18, RF09, RF11, RF18)
- **FR-003**: System MUST preserve a client's access to readings and alerts generated during that client's ownership period after the device is released or transferred. (RNF18, RF07, RF11)
- **FR-004**: System MUST prevent a newly claiming client from viewing, receiving, or inferring readings and alerts generated before its claim, across the dashboard history, alert views, public API, and real-time notifications. (RNF18, RF07, RF11, RF19, RI03, RI05, RI19, RI20)
- **FR-005**: System MUST discard readings received while a device has no owner; discarded readings MUST NOT be retained, shown in history, used to create alerts, returned by the public API, or emitted in real time. (RNF18, RF04, RF05, RI19, RI21)
- **FR-006**: System MUST discard alerts that would be generated for a device with no owner and MUST NOT expose them through any client-facing channel. (RNF18, RF09, RF11, RI19)
- **FR-007**: System MUST make a device have no owner when its current client performs the device's decommissioning operation, while preserving historical data already assigned to that client. (RNF18, RF12, RF18)
- **FR-008**: System MUST allow an ownerless device to be claimed by another client according to the existing device-management rules, with the new ownership period beginning at the successful claim. (RNF18, RF12, RF18)
- **FR-009**: System MUST delete all thresholds associated with a device when the device becomes ownerless, and MUST prevent those thresholds from producing alerts while the device is ownerless. (RNF18, RF08, RF09)
- **FR-010**: System MUST ensure that thresholds configured by a new owner apply only to data generated from that owner's claim onward and MUST NOT recreate or expose the previous owner's thresholds. (RNF18, RF08, RF18)
- **FR-011**: System MUST apply the historical client assignment consistently to all supported read and notification paths, including filtered queries, date ranges, device summaries, alert state management, public API responses, and real-time events. (RNF18, RF07, RF11, RF13, RF19, RI03, RI05, RI19, RI20)
- **FR-012**: System MUST reject or safely ignore attempts to use the current device owner, a client supplied by the requester, or another mutable device attribute as a substitute for the historical client assignment of an existing reading or alert. (RNF18, Constitution VI)

### Key Entities

- **Device ownership period**: The interval in which one client owns a device, beginning when the client successfully claims it and ending when the device is decommissioned or released.
- **Reading**: A sensor measurement generated by a device and permanently associated with the client that owned the device when it was generated.
- **Alert**: A threshold event generated from a reading and permanently associated with the client that owned the device when the event was generated.
- **Device threshold**: A client-specific rule used to evaluate future readings; it does not survive the device becoming ownerless.
- **Ownerless device**: A device available for a future claim, unable to retain or expose new readings, alerts, or active thresholds while unassigned.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of transfer tests, the new client sees zero readings and zero alerts generated before its claim, regardless of query channel, filter, date range, or notification channel.
- **SC-002**: In 100% of transfer tests, the former client retains access to 100% of readings and alerts generated during its ownership period.
- **SC-003**: In 100% of ownerless-device tests, readings and alerts received while unassigned are absent from history, alert lists, public API responses, and real-time deliveries.
- **SC-004**: In 100% of decommissioning tests, the device becomes available for a subsequent claim and has no active thresholds before that claim.
- **SC-005**: A complete acceptance flow (A generates data, A decommissions, B claims, both clients verify their views) completes without exposing any cross-client record and with every expected visibility result reproducible in repeated runs.
- **SC-006**: Existing device, history, alert, public API, and real-time workflows that do not involve a transfer continue to return the same client's data and remain usable without additional client-side steps.

## Assumptions

- The existing device-management operation called “baja” is the authoritative action that releases the current client association; it does not physically erase historical readings or alerts.
- A successful claim has a well-defined effective moment; data generated at or after that moment belongs to the claiming client.
- The current authentication, role, API-key, and transport protections remain in force; credentials per device, ACL, TLS, and claim tokens are explicitly out of scope.
- Historical readings and alerts already stored before this feature are treated as belonging to the client that owned the device when each record was generated; any migration required to establish that ownership is part of implementation planning.
- Existing authorization rules still determine which users and public credentials may act on behalf of a client; RNF18 adds historical ownership isolation rather than changing those permissions.
- Requirement identifiers referenced in this specification include RNF18 supplied by the feature request and the related RF/RI requirements in `docs/requisitos.md`.

> Nota: esta especificacion reemplaza la regla del spec 001 segun la cual las alertas de un dispositivo sin cliente se guardaban sin emitirse. Desde 003, las lecturas y alertas de un dispositivo sin propietario se descartan.
