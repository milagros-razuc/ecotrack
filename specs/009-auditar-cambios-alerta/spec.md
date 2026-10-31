# Feature Specification: Auditar cambios de estado de alertas

**Feature Branch**: `009-auditar-cambios-alerta`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "Hoy el cambio de estado de una alerta (pendiente/atendida) se guarda, pero NO deja ningún registro de quién lo hizo ni cuándo: PATCH /api/alertas/:id en backend/src/routes/alertas.js no llama a auditoriaService.registrar. Esto contradice la sección 4.6.6 del documento (toda acción administrativa auditada) y el criterio de trazabilidad. Objetivo: que cada cambio de estado quede registrado y sea visible en el front."

## Contexto y alcance

La feature 008 ya dejó disponible el historial de acciones de alertas, el endpoint
de consulta por alerta y la vista de historial en `auditor.html`. El defecto
pendiente está en el flujo que cambia el estado: la alerta se actualiza, pero el
Registro de actividad no recibe la transición. Esta feature completa ese flujo sin
crear una respuesta API nueva ni modificar el formato de `GET /api/alertas` o
`PATCH /api/alertas/:id`.

La fuente de requisitos relaciona este cambio con RF11, RF14, RI07, RNF04,
RNF05 y RNF18. La alerta conserva el cliente histórico que ya tiene y no se
modifica la regla de estados `pendiente`/`atendida`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar una transición de alerta (Priority: P1)

Como usuario autenticado de un cliente, quiero que al atender o reabrir una
alerta quede registrada mi identidad, mi nombre visible, el estado anterior,
el nuevo estado, el comentario y la fecha, para que la operación sea trazable.

**Why this priority**: Sin el registro de la transición, el historial y la
auditoría administrativa no reflejan la operación realizada.

**Independent Test**: Cambiar una alerta pendiente a atendida y luego volverla
a pendiente; consultar el historial y el Registro de actividad y verificar las
dos transiciones con sus datos completos.

**Acceptance Scenarios**:

1. **Given** una alerta pendiente visible para el usuario, **When** la marca
   como atendida con un comentario, **Then** se mantiene la respuesta actual de
   `PATCH` y se crea un registro con usuario, nombre vigente, estado anterior,
   estado nuevo, comentario y fecha.
2. **Given** una alerta atendida, **When** el usuario la reabre con o sin
   comentario, **Then** se crea otro registro independiente y no se sobrescribe
   el registro anterior.
3. **Given** una transición rechazada por validación, autorización o alerta
   inexistente, **When** finaliza la solicitud, **Then** no se crea un registro
   de cambio.
4. **Given** que el cambio de estado se confirmó correctamente, **When** falla
   el registro de auditoría, **Then** la alerta conserva el nuevo estado y la
   falla se informa mediante la observabilidad existente, sin revertir el cambio.
5. **Given** que un cambio válido genera una acción histórica y una fila
   administrativa, **When** se abre el Registro de actividad, **Then** el
   cambio de estado aparece una sola vez.

### User Story 2 - Consultar la trazabilidad en la alerta (Priority: P1)

Como usuario del cliente, quiero ver la línea de tiempo de una alerta al
abrirla en `auditor.html`, para conocer cuándo fue generada, atendida o
reabierta, por quién y con qué comentario.

**Why this priority**: La información registrada debe ser visible para que
aporte valor operativo y permita reconstruir la atención de la alerta.

**Independent Test**: Abrir una alerta con al menos una atención y una
reapertura y verificar la línea de tiempo cronológica, incluyendo los nombres,
fechas y comentarios disponibles.

**Acceptance Scenarios**:

1. **Given** una alerta con transiciones registradas, **When** el usuario abre
   su historial, **Then** ve la generación y cada atención o reapertura en
   orden temporal, con actor, fecha y comentario cuando exista.
2. **Given** una alerta de otro cliente, **When** un usuario intenta abrirla o
   consultar sus acciones, **Then** no obtiene la alerta ni sus usuarios o
   registros.
3. **Given** que un usuario actor fue eliminado posteriormente, **When** se
   muestra el historial, **Then** se conserva y se muestra el nombre guardado
   en el momento de la acción.
4. **Given** una alerta generada automáticamente, **When** se consulta su
   historial, **Then** la línea de tiempo incluye "Generada" con el timestamp
   de la alerta y el actor sistema.
5. **Given** una alerta existente sin una acción `generar_alerta` en
   `alerta_acciones`, **When** se consulta `/historial`, **Then** el endpoint
   deriva una única entrada "Generada" desde `alertas.timestamp` y
   `alertas.cliente_id`, sin modificar los datos históricos ni ejecutar una
   migración de datos.

### User Story 3 - Integrar la transición en actividad administrativa (Priority: P2)

Como administrador del cliente, quiero encontrar los cambios de estado en la
pestaña "Registro de actividad", para revisar la trazabilidad junto con las
demás acciones administrativas.

**Why this priority**: La auditoría transversal debe incluir todas las acciones
administrativas, no solo las operaciones sobre usuarios, dispositivos o
umbrales.

**Independent Test**: Realizar una atención y una reapertura, abrir el Registro
de actividad y verificar ambas entradas filtrables, con actor, detalle y fecha.

**Acceptance Scenarios**:

1. **Given** un administrador autenticado, **When** abre el Registro de
   actividad, **Then** identifica cada cambio de estado de alerta con su actor,
   acción, detalle y fecha.
2. **Given** filtros existentes de cliente, entidad, acción o fecha, **When**
   el administrador los aplica, **Then** solo aparecen registros de su cliente
   que cumplen esos filtros.
3. **Given** un usuario sin permisos administrativos, **When** intenta acceder
   al Registro de actividad, **Then** se conserva la restricción actual.
4. **Given** que el mismo cambio existe en `alerta_acciones` y `auditoria`,
   **When** se consulta la actividad, **Then** la interfaz muestra una sola
   entrada para ese cambio, usando la acción histórica como representación.

### Edge Cases

- Un comentario vacío también produce un registro con los estados y el actor.
- Varias transiciones consecutivas conservan el orden temporal y no eliminan
  registros anteriores.
- El nombre almacenado se conserva aunque el usuario sea eliminado después.
- Una falla aislada de auditoría no convierte una actualización exitosa en
  error ni devuelve una respuesta distinta de la actual.
- El cliente se obtiene de la identidad autenticada y de la alerta existente;
  nunca se acepta desde el cuerpo o parámetros del usuario.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST registrar cada transición válida entre
  `pendiente` y `atendida` con el identificador del usuario, su nombre de
  usuario en el momento del hecho, estado anterior, estado nuevo, comentario y
  fecha.
- **FR-002**: El sistema MUST conservar los registros históricos de todas las
  transiciones sin sobrescribirlos ni eliminarlos.
- **FR-003**: El sistema MUST mantener sin cambios incompatibles el formato de
  respuesta de `GET /api/alertas` y `PATCH /api/alertas/:id`.
- **FR-004**: El sistema MUST mostrar las transiciones registradas en la línea
  de tiempo de cada alerta en `auditor.html`, junto con la generación cuando
  esté disponible o derivada desde la alerta.
- **FR-005**: El sistema MUST mostrar los cambios de estado en la pestaña
  "Registro de actividad" con actor, acción, detalle y fecha, respetando sus
  filtros y paginación existentes, sin mostrar dos veces un cambio que también
  tenga una fila administrativa equivalente.
- **FR-006**: Toda consulta de alertas, historial y actividad MUST quedar
  limitada al `cliente_id` de la alerta y del usuario autenticado; no debe
  exponer datos de otro cliente.
- **FR-007**: El sistema MUST conservar el nombre de usuario persistido en el
  registro aunque la cuenta del usuario sea eliminada posteriormente.
- **FR-008**: Una solicitud inválida, no autorizada o referida a una alerta
  inexistente MUST no crear un registro de transición.
- **FR-009**: Una falla al registrar la auditoría MUST ser observable y no
  revertir ni invalidar el cambio de estado que ya fue confirmado.
- **FR-010**: El acceso administrativo al Registro de actividad MUST conservar
  sus permisos actuales y el historial de alerta MUST permanecer de solo
  lectura.
- **FR-011**: La generación automática de una alerta nueva MUST crear una
  acción histórica `generar_alerta` con timestamp igual al de la alerta y
  actor sistema. Para alertas existentes sin esa acción, `/historial` MUST
  derivar una única entrada "Generada" desde `alertas.timestamp` y
  `alertas.cliente_id`, sin migración ni modificación de datos históricos.
- **FR-012**: El Registro de actividad MUST usar una sola representación de
  cada cambio de estado: conservar la acción de `alerta_acciones` y excluir,
  únicamente mediante un `WHERE accion <> 'cambiar_estado_alerta'` en la rama
  `SELECT ... FROM auditoria` de la consulta unificada de
  `auditoria.service.js` (líneas 63-64), la fila administrativa equivalente.
  El filtro afecta la respuesta de `GET /api/auditoria` y de la pestaña
  "Registro de actividad"; la tabla `auditoria` conserva todos sus registros.
  Por lo tanto, filtrar `GET /api/auditoria?accion=cambiar_estado_alerta`
  devuelve vacío.
- **FR-013**: La respuesta de actividad MUST conservar el campo `origen`
  además de `id`, y cualquier identidad de fila o acción en `auditor.html`
  MUST usar la combinación `origen` + `id`, nunca `id` por sí solo, porque los
  identificadores pueden repetirse entre `auditoria` y `alerta_acciones`.
- **FR-014**: La auditoría administrativa MUST ejecutarse después del commit
  de la actualización y la acción histórica; una falla simulada en el INSERT
  de `auditoria` mediante `pool.query` (o un stub equivalente que lance dentro
  de `auditoriaService.registrar`) MUST dejar la respuesta de PATCH sin cambios
  y conservar el nuevo estado y la acción histórica.
- **FR-015**: El comentario enviado al cambiar el estado MUST guardarse en
  `alerta_acciones.detalle` y devolverse como `detalle` por `/historial`, junto
  con el actor, acción y timestamp.

### Key Entities

- **Alerta**: Registro existente con estado, comentario, fecha de generación y
  cliente histórico.
- **Cambio de estado auditado**: Registro inmutable asociado a una alerta, con
  usuario, nombre conservado, estado anterior, estado nuevo, comentario y fecha.
- **Línea de tiempo de alerta**: Secuencia de generación y cambios de estado
  presentada en orden temporal.
- **Actividad administrativa**: Vista unificada que muestra una sola
  representación de cada cambio de alerta, tomada de `alerta_acciones`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las transiciones válidas ejecutadas en pruebas genera
  exactamente un registro con todos los datos de trazabilidad requeridos.
- **SC-002**: El 100% de las transiciones verificadas aparece tanto en el
  historial de la alerta como en el Registro de actividad del mismo cliente.
- **SC-003**: El 100% de los intentos verificados entre clientes devuelve cero
  alertas, usuarios o registros del cliente ajeno.
- **SC-004**: El 100% de los registros de prueba conserva el nombre del actor
  después de eliminar su cuenta.
- **SC-005**: Las respuestas de `GET /api/alertas` y `PATCH /api/alertas/:id`
  mantienen sus formas actuales en el 100% de las pruebas de regresión.
- **SC-006**: Una falla simulada de auditoría deja el estado actualizado en el
  100% de las pruebas y genera una señal observable para diagnóstico.

## Assumptions

- La persistencia y consulta del historial de la feature 008 se reutilizan; no
  se crea una segunda fuente de historial.
- El comentario continúa usando el límite y validación actuales.
- El actor y el nombre se obtienen de la identidad autenticada; el cliente no
  se acepta desde datos enviados por el usuario.
- Las alertas anteriores sin registros nuevos no reciben transiciones
  inventadas retroactivamente.
- No se modifican los permisos existentes ni se agregan estados de alerta.

## Trazabilidad de requisitos

Esta feature implementa o verifica **RF11**, **RF14**, **RI07**, **RNF04**,
**RNF05** y **RNF18**, y cumple la sección 4.6.6 sobre auditoría de acciones
administrativas.
