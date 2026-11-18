# Feature Specification: Device Shadow e intervalo configurable

**Feature Branch**: `025-device-shadow-intervalo`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "Device Shadow e intervalo de medición configurable por dispositivo."

## Relación con requisitos y specs existentes

Esta feature implementa y amplía RF02 (configuración del intervalo), RF12 (gestión
de dispositivos), RF14 (auditoría), RF18 (aislamiento por cliente), RI02/RI19
(estado visible y tiempo real), RNF16 (ACL por dispositivo), RNF18
(aislamiento histórico), RNF20 (eventos por cliente) y RF22/RF23
(continuidad e integridad de lecturas). Requiere relevar el firmware y la
comunicacion MQTT actuales antes de planificar los cambios técnicos.

## User Scenarios & Testing

### User Story 1 - Ver el estado deseado frente al reportado (Priority: P1)

Como administrador de un cliente, quiero ver para cada dispositivo el intervalo
deseado, el intervalo aplicado reportado y su estado de sincronización, para
saber si una configuración pendiente fue aplicada.

**Why this priority**: Da visibilidad operativa y permite distinguir una
configuración pendiente de un rechazo o una falta de respuesta.

**Independent Test**: En un dispositivo que reporta su intervalo actual, el
administrador lo ve como sincronizado junto con la fecha del último reporte.

**Acceptance Scenarios**:

1. **Given** un administrador autenticado y un dispositivo de su cliente,
   **When** consulta el detalle del dispositivo, **Then** visualiza el intervalo
   deseado, el intervalo reportado, la fecha del último reporte y el estado
   sincronizado.
2. **Given** que el deseado difiere del reportado o todavía no existe reporte,
   **When** el administrador consulta el dispositivo, **Then** visualiza el estado
   pendiente o sin respuesta según corresponda.
3. **Given** un dispositivo con intervalo rechazado, **When** el administrador
   consulta el detalle, **Then** visualiza el estado rechazado y el motivo.

---

### User Story 2 - Cambiar el intervalo con el dispositivo online (Priority: P1)

Como administrador, quiero establecer un intervalo nuevo y confirmar que el
dispositivo lo aplica sin reflashearlo y conserva la configuración al reiniciar.

**Why this priority**: Es el flujo principal de configuración remota.

**Independent Test**: Cambiar un dispositivo sincronizado de 60 a 30 segundos y
comprobar que confirma la nueva versión y que las lecturas posteriores siguen el
nuevo intervalo tras reiniciar.

**Acceptance Scenarios**:

1. **Given** un dispositivo online y sincronizado, **When** el administrador
   solicita un intervalo válido, **Then** el nuevo valor queda marcado deseado,
   recibe una versión nueva y aparece como pendiente hasta la confirmación.
2. **Given** una confirmación correspondiente a la última versión deseada,
   **When** el dispositivo informa el intervalo aplicado, **Then** el dashboard
   muestra el estado sincronizado.
3. **Given** una confirmación con una versión anterior, **When** se recibe,
   **Then** no reemplaza el estado pendiente ni se considera sincronización.
4. **Given** que el dispositivo reinicia después de aceptar el cambio,
   **When** inicia de nuevo, **Then** conserva y reporta el intervalo aplicado.

---

### User Story 3 - Cambiar el intervalo con el dispositivo offline (Priority: P1)

Como administrador, quiero guardar un intervalo aunque el dispositivo esté
offline y que lo aplique automáticamente al reconectarse.

**Why this priority**: Permite configurar equipos remotos sin exigir disponibilidad
continua.

**Independent Test**: Apagar el dispositivo, cambiar el intervalo, encenderlo y
comprobar que aplica y confirma el último valor deseado.

**Acceptance Scenarios**:

1. **Given** un dispositivo offline, **When** el administrador solicita un cambio
   válido, **Then** el sistema conserva el valor deseado y lo marca pendiente.
2. **Given** varios cambios realizados mientras el dispositivo estaba offline,
   **When** reconecta, **Then** recibe y aplica únicamente la última versión
   deseada.
3. **Given** que el dispositivo reconecta, **When** obtiene el estado deseado,
   **Then** aplica, persiste y confirma el intervalo sin reenvío manual.

---

### User Story 4 - Rechazo y falta de respuesta (Priority: P2)

Como administrador, quiero reconocer cuándo un dispositivo rechaza el cambio o
no confirma una configuración vigente.

**Why this priority**: Evita que un intervalo incorrecto quede indefinidamente
representado como pendiente.

**Independent Test**: Enviar un intervalo fuera de rango y comprobar que el
dispositivo conserva el anterior y reporta el rechazo; luego comprobar que un
dispositivo online sin confirmación pasa a sin respuesta después del plazo.

**Acceptance Scenarios**:

1. **Given** un valor fuera del rango soportado, **When** el dispositivo lo
   recibe, **Then** lo rechaza, conserva el intervalo anterior y reporta el motivo.
2. **Given** un rechazo recibido, **When** el administrador consulta el detalle,
   **Then** el estado cambia a rechazado sin perder el intervalo reportado.
3. **Given** un dispositivo online que no confirma dentro del plazo configurable,
   **When** transcurre ese plazo, **Then** el estado pasa a sin respuesta.

---

### User Story 5 - Consultar el historial del intervalo (Priority: P2)

Como administrador, quiero consultar quién cambió el intervalo, cuándo y cuál fue
el resultado, para auditar las operaciones.

**Why this priority**: Permite trazabilidad de cambios y diagnósticos operativos.

**Independent Test**: Cambiar dos veces el intervalo y comprobar que el historial
incluye actor, fecha, valor anterior, valor nuevo y resultado.

**Acceptance Scenarios**:

1. **Given** un cambio autorizado, **When** se guarda, **Then** el historial
   registra actor, cliente, dispositivo, valor anterior, valor nuevo y hora.
2. **Given** un rechazo del dispositivo, **When** se informa, **Then** el historial
   registra el rechazo y su motivo.
3. **Given** dispositivos de otro cliente, **When** un administrador consulta
   historial o detalle, **Then** recibe el mismo rechazo 404 que para un
   dispositivo inexistente.

### Edge Cases

- El dispositivo reinicia mientras aplica un cambio.
- Hay varios cambios seguidos mientras el dispositivo está offline.
- Se reciben reportes duplicados o fuera de orden.
- Un dispositivo es dado de baja o reasignado: su configuración anterior no se
  hereda ni se expone al nuevo cliente.
- Un firmware antiguo no reconoce el mecanismo: el estado se informa como no
  soportado y no como error técnico.
- Se pierde la confirmación: el dispositivo reenvía el estado al reconectar o
  periódicamente.
- Se intenta guardar un valor no numérico, negativo, cero o fuera de rango:
  la solicitud se rechaza con una explicación válida y sin error interno.
- Un cambio no debe descartar lecturas pendientes ni duplicar lecturas ya enviadas.

## Requirements

### Functional Requirements

- **FR-001**: El sistema MUST mantener por dispositivo un estado deseado, un estado
  reportado, una versión del deseado, la fecha del último reporte y el estado de
  sincronización.
- **FR-002**: Cada cambio autorizado del deseado MUST incrementar su versión y la
  confirmación solo puede sincronizar si indica la versión aplicada más reciente.
- **FR-003**: Cambios sucesivos del deseado MUST terminar en el último valor
  válido aceptado, sin estados intermedios inconsistentes ni cambios simultáneos
  ambiguos.
- **FR-004**: El backend y el dispositivo MUST rechazar valores fuera del rango
  permitido de 10 a 3600 segundos.
- **FR-005**: El dispositivo MUST conservar el último intervalo aplicado en
  memoria no volátil y restaurarlo tras reinicios o cortes de alimentación.
- **FR-006**: Un dispositivo sin configuración previa MUST usar y reportar un
  intervalo de fábrica de 10 segundos.
- **FR-007**: Al reconectar, el dispositivo MUST obtener el último estado deseado
  sin intervención manual y reportar su estado aplicado.
- **FR-008**: Solo un administrador del mismo cliente y el `platform_admin` MUST
  poder cambiar el intervalo. Un usuario común solo puede verlo.
- **FR-009**: Un intento de administrador sobre otro cliente o sobre un dispositivo
  inexistente MUST responder un 404 indistinguible sin modificar el sistema.
- **FR-010**: Un dispositivo MUST poder leer únicamente su propio estado deseado y
  reportar únicamente su propio estado aplicado.
- **FR-011**: Cada cambio deseado y cada rechazo MUST quedar auditado con usuario
  o identidad que originó el evento, cliente, dispositivo, valor anterior y valor
  nuevo, sin secretos ni credenciales.
- **FR-012**: Los reportes MUST ignorarse si no corresponden a la identidad
  autenticada del dispositivo ni a su cliente actual.
- **FR-013**: Los cambios de sincronización y rechazo MUST reflejarse en el
  dashboard sin recargar.
- **FR-014**: El diseño del shadow MUST ser extensible por clave y esquema de
  validación; esta feature solo habilita la clave de intervalo.
- **FR-015**: Si el dispositivo figura online y no confirma dentro de un plazo
  configurable de 60 segundos, el estado MUST pasar a sin respuesta.
- **FR-016**: El valor anterior aplicado MUST mantenerse si el dispositivo rechaza
  una configuración nueva.

### Key Entities

- **Shadow de dispositivo**: Estado deseado y reportado por parámetro, versión
  deseada, última confirmación y estado derivado de sincronización.
- **Configuración deseada**: Clave, valor entero, versión, fecha de solicitud,
  solicitante y cliente.
- **Reporte aplicado**: Identidad del dispositivo, clave, valor aplicado, versión
  aplicada, fecha y motivo opcional de rechazo.
- **Historial de intervalo**: Cambio solicitado y resultado, con valores anterior
  y nuevo, actor, dispositivo, cliente y fecha.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Un cambio con el dispositivo online queda confirmado en menos de
  10 segundos en condiciones normales de conexión.
- **SC-002**: Un cambio realizado offline queda aplicado y confirmado en menos de
  30 segundos desde la reconexión.
- **SC-003**: Después de 20 reinicios consecutivos, el último intervalo aplicado
  permanece vigente y se informa correctamente.
- **SC-004**: El 100 % de los intentos sobre dispositivos de otro cliente recibe
  una respuesta 404 indistinguible de un dispositivo inexistente.
- **SC-005**: En una prueba con credenciales de dos dispositivos distintos, ninguno
  puede leer ni reportar el shadow del otro.
- **SC-006**: Los cambios válidos no pierden ni duplican lecturas pendientes,
  independientemente de la frecuencia seleccionada.
- **SC-007**: Los usuarios autorizados pueden identificar sin ambigüedad si el
  intervalo está sincronizado, pendiente, rechazado, sin respuesta o no soportado.

## Assumptions

- El broker MQTT, la tabla de dispositivos con `cliente_id`, la autenticación de
  dispositivos y el canal de tiempo real ya existen y pueden reutilizarse.
- El rango aceptado es de 10 a 3600 segundos.
- El intervalo de fábrica inicial confirmado es de 10 segundos.
- El plazo inicial de falta de respuesta es de 60 segundos y debe poder
  configurarse sin cambiar el firmware.
- La feature modifica firmware, broker, backend y dashboard; no incluye OTA ni
  actualización remota de firmware.

## Fuera de alcance

- OTA y actualización de firmware.
- Persistencia en dispositivo de buffers de 24 horas.
- Notificaciones externas por Telegram, Slack, correo o SMS.
- Parámetros distintos del intervalo de medición.
- Intervalos diferentes según la hora o una programación horaria.
