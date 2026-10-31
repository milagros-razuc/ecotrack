# Feature Specification: Trazabilidad de alertas

**Feature Branch**: `008-trazabilidad-alertas`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Antes de escribir la spec, leé la constitution y lo ya implementado en el repo; reutilizá lo existente y marcá qué parte ya está hecha y qué falta. Quiero que el dashboard muestre la trazabilidad de cada alerta: qué se hizo con ella, quién y cuándo. Como usuario del cliente, cuando marco una alerta como atendida (o cambio su estado), queda registrado quién lo hizo, cuándo y, opcionalmente, una nota. Como usuario, en el detalle de cada alerta veo su historial completo de acciones, ordenado en el tiempo, desde que se generó. Como auditor, puedo ver ese historial en auditor.html y en el Registro de actividad. El historial es de solo lectura desde la interfaz; un usuario solo ve acciones de alertas de su propio cliente; la alerta conserva su cliente_id aunque el dispositivo cambie de dueño. Revisá qué ya existe y no inventes campos."

## Contexto y estado actual

La implementación existente ya aporta estas piezas y deben reutilizarse:

- **Ya implementado**: la tabla `alertas` tiene `estado` con valores `pendiente`/`atendida`, `comentario` opcional y `timestamp` de generación.
- **Ya implementado**: `PATCH /api/alertas/:id` permite cambiar el estado y guardar el comentario, validando el estado y limitando el comentario a 500 caracteres.
- **Ya implementado**: el servicio de alertas actualiza una alerta solo cuando su `id` y `cliente_id` coinciden con el usuario autenticado.
- **Ya implementado**: `alertas.cliente_id` se captura al generar la alerta y se conserva durante el cambio de dueño del dispositivo, conforme a RNF18.
- **Ya implementado**: existe la tabla `auditoria` con los campos `cliente_id`, `usuario_id`, `usuario_username`, `accion`, `entidad`, `entidad_id`, `detalle` y `timestamp`; el listado administrativo filtra por `cliente_id` y ordena por fecha.
- **Ya implementado**: `auditor.html` muestra alertas, permite marcar/reabrir con comentario y tiene un “Registro de actividad” administrativo con filtros y paginación.
- **Pendiente**: los cambios de estado de alertas no generan actualmente un registro en `auditoria`.
- **Pendiente**: la generación automática de una alerta no aparece como acción inicial de su historial.
- **Pendiente**: no existe una consulta de historial asociada a una alerta ni una vista de detalle/historial en `auditor.html`.
- **Pendiente**: el Registro de actividad no identifica ni filtra de forma específica las acciones de alertas ni permite abrir su historial.
- **Pendiente**: debe definirse y verificarse el tratamiento visible del actor sistema para la generación automática, reutilizando los campos nullable existentes y sin agregar campos inventados.

La fuente de requisitos relaciona esta feature con RF09, RF11, RF14, RF18, RI05, RI07, RNF04, RNF05 y RNF18. No se debe cambiar la regla de negocio de estados, el aislamiento multi-cliente ni la pertenencia histórica de la alerta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar acciones de una alerta (Priority: P1)

Como usuario del cliente, quiero que cada cambio de estado de una alerta conserve quién lo realizó, cuándo y la nota opcional, para que la atención quede trazable.

**Why this priority**: Sin registrar la acción no existe trazabilidad confiable ni base para mostrar un historial.

**Independent Test**: Generar una alerta, cambiarla a atendida con una nota, reabrirla con otra nota y consultar los registros; deben aparecer la generación y ambas transiciones con actor, momento, acción y detalle correctos.

**Acceptance Scenarios**:

1. **Given** una alerta pendiente visible para el cliente, **When** un usuario la marca como atendida con una nota opcional, **Then** se conserva el estado actual de la alerta y se registra una acción con el usuario, el momento, la alerta identificada y la nota disponible en el campo de detalle existente.
2. **Given** una alerta atendida, **When** un usuario la vuelve a pendiente, **Then** se registra una nueva acción independiente sin borrar las acciones anteriores.
3. **Given** una alerta generada automáticamente, **When** se consulta su historial, **Then** aparece una acción inicial de generación con fecha de la alerta y actor identificable como sistema, sin atribuirla a un usuario inexistente.
4. **Given** una actualización de estado rechazada por validación o pertenencia, **When** la operación falla, **Then** no se registra una acción de cambio ni se modifica la alerta.
5. **Given** una alerta cuyo dispositivo cambia de dueño, **When** se consultan sus acciones, **Then** conserva el `cliente_id` que tenía al generarse y las acciones siguen perteneciendo a ese cliente histórico.

---

### User Story 2 - Consultar el historial de una alerta (Priority: P1)

Como usuario del cliente, quiero abrir el detalle de una alerta y ver todas sus acciones ordenadas en el tiempo, desde su generación, para entender qué ocurrió.

**Why this priority**: El registro solo aporta valor operativo si cada alerta puede explicarse desde su origen hasta su estado actual.

**Independent Test**: Seleccionar una alerta con varias acciones y abrir su historial; verificar el orden cronológico, actor, fecha, acción y nota, sin posibilidad de editar los registros.

**Acceptance Scenarios**:

1. **Given** una alerta con generación y cambios de estado, **When** el usuario abre su detalle, **Then** ve todas las acciones de esa alerta ordenadas de la más antigua a la más reciente.
2. **Given** una acción con nota y otra sin nota, **When** se muestra el historial, **Then** la nota aparece solo donde existe y la ausencia de nota no se confunde con un error.
3. **Given** un usuario que no pertenece al cliente de la alerta, **When** intenta consultar su historial, **Then** no obtiene acciones ni datos de esa alerta.
4. **Given** el historial visible, **When** el usuario interactúa con sus filas, **Then** no puede modificar, eliminar ni reordenar persistentemente ninguna acción desde la interfaz.
5. **Given** una alerta sin acciones históricas por datos previos a esta feature, **When** se abre su detalle, **Then** se muestra el estado disponible de forma explícita y no se inventan acciones retroactivas.

---

### User Story 3 - Auditar acciones de alertas (Priority: P2)

Como auditor, quiero ver las acciones de alertas dentro de auditor.html y del Registro de actividad, para revisar la trazabilidad junto con el resto de la actividad del cliente.

**Why this priority**: La auditoría necesita una vista transversal, además del detalle operativo de una alerta.

**Independent Test**: Abrir el Registro de actividad como admin, filtrar acciones de alertas y seleccionar una acción; verificar que la lista respeta el cliente, fechas, paginación y vínculo al historial de la alerta.

**Acceptance Scenarios**:

1. **Given** un admin autenticado, **When** abre el Registro de actividad, **Then** puede identificar las acciones cuya entidad es una alerta y ver actor, acción, detalle y fecha.
2. **Given** filtros de entidad, acción o fechas, **When** el admin los aplica, **Then** solo aparecen acciones de auditoría que cumplen los filtros y pertenecen a su cliente.
3. **Given** una acción de alerta en el Registro de actividad, **When** el auditor la selecciona, **Then** puede acceder al historial completo de la alerta sin perder el contexto.
4. **Given** un usuario común, **When** intenta acceder a la capacidad administrativa de actividad, **Then** se mantiene la restricción de rol existente.

### Edge Cases

- Se registra una transición aunque el comentario sea vacío; la acción sigue mostrando actor, momento y estado/acción.
- El mismo usuario cambia varias veces el estado: cada transición conserva su propio timestamp y no sobrescribe las anteriores.
- La generación automática no tiene usuario autenticado: se identifica como sistema usando los campos existentes `usuario_id` nullable y `usuario_username`.
- Una alerta histórica existente antes de la feature no tiene acciones de auditoría: el historial lo informa como incompleto para ese período, sin fabricar registros.
- Dos acciones ocurren muy cerca: el orden se determina por timestamp y un criterio estable disponible en los registros.
- Un comentario contiene texto largo o caracteres especiales: se conserva dentro del límite existente de 500 caracteres y se muestra escapado de forma segura.
- Una alerta pertenece a un cliente histórico cuyo dispositivo fue liberado o transferido: ningún listado o historial la reasigna al nuevo dueño.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST registrar una acción inicial cuando se genera una alerta automática, usando la estructura de auditoría existente y un actor sistema identificable.
- **FR-002**: El sistema MUST registrar cada cambio válido entre los estados `pendiente` y `atendida`, incluyendo el usuario autenticado, el momento, la alerta, la acción realizada y el detalle disponible.
- **FR-003**: El sistema MUST conservar todas las acciones de una alerta sin sobrescribir ni eliminar las anteriores cuando cambia su estado.
- **FR-004**: El sistema MUST conservar la nota opcional de la gestión usando el campo de comentario ya existente para el estado actual y/o el campo de detalle existente para la acción histórica, sin introducir nombres de campos alternativos en el contrato de negocio.
- **FR-005**: El sistema MUST ofrecer el historial completo de una alerta ordenado cronológicamente desde la generación hasta la acción más reciente.
- **FR-006**: El historial MUST ser de solo lectura desde la interfaz; las acciones solo se generan como consecuencia de operaciones válidas existentes.
- **FR-007**: El sistema MUST permitir consultar el historial desde el contexto de cada alerta en `auditor.html`.
- **FR-008**: El Registro de actividad MUST mostrar las acciones de alertas junto con actor, acción, fecha y detalle, y permitir filtrarlas usando sus filtros existentes.
- **FR-009**: El sistema MUST mantener la restricción administrativa existente para el Registro de actividad sin ampliar permisos por esta feature.
- **FR-010**: Toda consulta, listado y acceso a historial MUST limitarse al `cliente_id` histórico de la alerta y nunca al cliente actual del dispositivo ni a un valor enviado por el usuario.
- **FR-011**: Una operación de cambio de estado que no se completa por validación, autorización o inexistencia MUST no crear una acción de auditoría.
- **FR-012**: El sistema MUST mantener las acciones existentes de estado, comentario, filtros, paginación y aislamiento que ya consume el dashboard.
- **FR-013**: Las acciones históricas previas a esta feature MUST conservarse y mostrarse tal como existan; el sistema MUST indicar la ausencia de historial cuando no haya registros, sin crear eventos retroactivos.

### Key Entities

- **Alerta**: Registro existente con `id`, `cliente_id`, `dispositivo_codigo`, `variable`, valores, `timestamp`, `estado` y `comentario`; conserva su cliente histórico al generarse.
- **Registro de auditoría**: Registro existente con `cliente_id`, `usuario_id`, `usuario_username`, `accion`, `entidad`, `entidad_id`, `detalle` y `timestamp`; representa la generación o una transición de una alerta.
- **Actor**: Usuario autenticado responsable de una transición, o sistema para la generación automática; se representa con los campos de usuario ya existentes, sin inventar atributos.
- **Historial de alerta**: Consulta de registros de auditoría de una alerta específica, de solo lectura y ordenada por tiempo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los cambios válidos de estado de alerta verificados genera exactamente un registro histórico con actor, acción y timestamp.
- **SC-002**: El 100% de las alertas automáticas nuevas verificadas presenta una acción inicial de generación en su historial.
- **SC-003**: En el 100% de las consultas verificadas, el historial aparece ordenado cronológicamente y conserva todas las acciones realizadas.
- **SC-004**: El 100% de las consultas realizadas con usuarios de otro cliente devuelve cero acciones o acceso equivalente a datos de la alerta.
- **SC-005**: Al menos el 90% de los auditores de prueba puede encontrar las acciones de una alerta usando el Registro de actividad en menos de 3 minutos.
- **SC-006**: Las acciones existentes de marcar atendida, reabrir, agregar comentario, filtrar y paginar continúan funcionando sin cambios de permisos en la suite de regresión.

## Assumptions

- Se reutilizan las tablas y columnas existentes `alertas` y `auditoria`; no se agrega una entidad paralela ni se inventan campos nuevos.
- La generación automática se atribuye al sistema mediante `usuario_id` nulo y `usuario_username` con el identificador de sistema que defina el contrato existente, mientras `cliente_id` proviene del propietario histórico de la alerta.
- Las alertas anteriores a la implementación no se reconstruyen ni reciben eventos inventados; solo se muestran los registros que existan.
- La nota ingresada al gestionar continúa limitada a 500 caracteres por el contrato actual.
- El historial visible puede estar disponible para usuarios autenticados del cliente, mientras el Registro de actividad conserva su acceso exclusivo para admin.
- No se cambia el modelo de estados: solo se mantienen `pendiente` y `atendida`.

## Trazabilidad de requisitos

Esta feature implementa o verifica **RF09**, **RF11**, **RF14**, **RF18**, **RI05**, **RI07**, **RNF04**, **RNF05** y **RNF18**. No modifica la semántica de cliente histórico ni contradice los requisitos existentes.
