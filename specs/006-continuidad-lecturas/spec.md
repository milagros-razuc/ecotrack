# Feature Specification: Continuidad de lecturas y fecha de captura

**Feature Branch**: `006-continuidad-lecturas`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Continuidad de lecturas y fecha de captura (spec 006). Problema: hoy, cuando un nodo pierde la conexión con el broker, las lecturas de ese período se pierden. Además, cada lectura se almacena con la hora de recepción en el backend, no con la hora en que se midió. El documento del proyecto define este comportamiento en RF22, RF23 y RNF22; esta spec lo implementa."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conservar lecturas durante una desconexión (Priority: P1)

Como operador de la plataforma, necesito que un nodo siga capturando lecturas cuando pierde la conexión con el broker, para recuperar la información del período desconectado al restablecerse la comunicación.

**Why this priority**: Evita perder datos ambientales y permite que el histórico represente el período completo, incluso ante cortes breves de red o del broker.

**Independent Test**: Desconectar un nodo del broker durante varios minutos, generar lecturas al intervalo configurado, reconectarlo y verificar que las lecturas acumuladas aparecen en la base en orden de captura antes de las lecturas nuevas.

**Acceptance Scenarios**:

1. **Given** un nodo sin conexión con el broker y el intervalo de captura por defecto de 10 segundos, **When** transcurre una hora sin reiniciar el nodo, **Then** conserva hasta 360 lecturas en memoria y continúa capturando sin bloquearse.
2. **Given** el buffer contiene lecturas y el nodo recupera la conexión, **When** comienza la transferencia, **Then** publica las lecturas desde la más antigua hasta la más nueva, con una pausa breve entre mensajes, y después retoma la publicación normal.
3. **Given** el buffer ya contiene 360 lecturas, **When** se captura una lectura adicional sin conexión, **Then** se descarta la lectura más antigua y se conserva la nueva.
4. **Given** el nodo se reinicia mientras tiene lecturas diferidas, **When** vuelve a capturar y publicar, **Then** las lecturas que estaban en memoria antes del reinicio no reaparecen.
5. **Given** una lectura generada sin conexión y posteriormente transferida, **When** el backend la recibe, **Then** la almacena con su fecha de captura y conserva el orden cronológico junto con las demás lecturas.

---

### User Story 2 - Consultar lecturas con la fecha en que fueron medidas (Priority: P1)

Como usuario del sistema, necesito que cada lectura refleje el momento en que fue capturada y no solo el momento en que llegó al backend, para interpretar correctamente el histórico y la última lectura.

**Why this priority**: Una hora de recepción incorrecta puede ubicar los datos en el período equivocado y alterar la interpretación de la evolución de una medición.

**Independent Test**: Publicar lecturas con y sin fecha de captura, verificar el timestamp almacenado, consultar la última lectura y consultar el histórico agregado.

**Acceptance Scenarios**:

1. **Given** un nodo con el reloj sincronizado, **When** publica una lectura con `ts` en segundos Unix UTC, **Then** el backend la almacena usando ese valor como fecha de captura.
2. **Given** un nodo cuyo reloj todavía no fue sincronizado, **When** publica una lectura sin `ts`, **Then** el backend la almacena con la hora de recepción y el nodo no la incorpora al buffer de lecturas diferidas.
3. **Given** existe una lectura recibida recientemente y otra con fecha de captura anterior, **When** se consulta la última lectura del dispositivo, **Then** se devuelve la más reciente por fecha de captura y la lectura diferida no la reemplaza.
4. **Given** una lectura diferida pertenece al mes calendario anterior, **When** se almacena y consulta el histórico, **Then** queda en la partición mensual y agregado correspondiente a su fecha de captura.
5. **Given** se consulta la última conexión del dispositivo, **When** llegan lecturas con o sin atraso, **Then** se actualiza con la hora de recepción y no con el `ts` de la lectura.

---

### User Story 3 - Procesar lecturas diferidas sin efectos actuales (Priority: P1)

Como responsable de operación, necesito que una lectura que llega con más de cinco minutos de atraso conserve su valor histórico sin activar acciones sobre el estado actual del dispositivo.

**Why this priority**: Evita alertas y eventos engañosos causados por condiciones que ya ocurrieron, sin perder el dato para análisis histórico.

**Independent Test**: Enviar lecturas con atrasos de cinco minutos o menos y de más de cinco minutos, y verificar por separado almacenamiento, evaluación de umbrales, alertas y eventos en tiempo real.

**Acceptance Scenarios**:

1. **Given** una lectura cuyo atraso respecto de la recepción es de cinco minutos o menos, **When** supera un umbral, **Then** mantiene el comportamiento actual de evaluación, alerta y evento en tiempo real.
2. **Given** una lectura cuyo atraso respecto de la recepción es mayor de cinco minutos y está dentro del rango válido, **When** llega al backend, **Then** se almacena con su `ts` original pero no evalúa umbrales, no genera alertas ni emite eventos en tiempo real.
3. **Given** una lectura tiene un `ts` más de un minuto en el futuro o más de 24 horas en el pasado, **When** llega al backend, **Then** se rechaza y no se almacena ni produce alertas o eventos.
4. **Given** una lectura tiene un `ts` anterior a `reclamado_en` del dispositivo, **When** llega al backend, **Then** se descarta sin almacenar, alertar ni emitir eventos, para impedir que el propietario nuevo reciba datos del propietario anterior.
5. **Given** el dispositivo no tiene propietario, **When** llega cualquier lectura, **Then** se mantiene el descarte existente sin almacenar ni generar efectos derivados.

### Edge Cases

- El `ts` está ausente, es nulo, no es un número entero en segundos Unix o no puede interpretarse como una fecha válida: se trata como una lectura sin fecha de captura solo cuando el contrato existente lo permita; un valor presente pero inválido se rechaza como payload inválido.
- El `ts` está exactamente un minuto en el futuro, exactamente 24 horas en el pasado o exactamente cinco minutos atrasado: se aplican los límites inclusivos definidos arriba.
- El `ts` coincide con `reclamado_en`: la lectura no se descarta por antigüedad de propietario.
- El buffer se llena mientras el broker está disponible de forma intermitente: las lecturas que no se publican se ordenan por captura y se conserva siempre la ventana más reciente de 360 lecturas.
- La transferencia del buffer falla después de publicar algunas lecturas: las lecturas no confirmadas no deben perderse por una falsa recuperación, y el nodo debe poder reintentar sin duplicar lecturas ya aceptadas.
- Una lectura diferida llega después de una lectura más reciente y pertenece a otra partición mensual: el histórico debe conservar ambas y la consulta de última lectura debe continuar devolviendo la más reciente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El dispositivo MUST continuar capturando lecturas cuando no pueda comunicarse con el broker, sin bloquear la captura normal.
- **FR-002**: El dispositivo MUST mantener en memoria un buffer volátil de hasta 360 lecturas, equivalente a una hora al intervalo por defecto de 10 segundos.
- **FR-003**: Cuando el buffer alcance su capacidad, el dispositivo MUST descartar la lectura más antigua antes de conservar una nueva.
- **FR-004**: Al recuperar la conexión, el dispositivo MUST publicar el buffer desde la lectura más antigua hasta la más nueva, con una pausa breve entre mensajes, y luego MUST continuar con la publicación normal.
- **FR-005**: El buffer MUST ser volátil y MUST NOT recuperar lecturas que existían antes de un reinicio del dispositivo.
- **FR-006**: Cada lectura capturada con el reloj sincronizado MUST publicarse con `ts`, expresado como fecha y hora UTC en segundos Unix.
- **FR-007**: El backend MUST almacenar una lectura con `ts` usando la fecha de captura indicada, en vez de sustituirla por la hora de recepción.
- **FR-008**: Si el reloj del dispositivo todavía no está sincronizado, el dispositivo MUST publicar la lectura sin `ts` y MUST no incorporarla al buffer de lecturas diferidas; el backend MUST almacenarla con la hora de recepción.
- **FR-009**: El backend MUST rechazar una lectura cuyo `ts` sea más de un minuto futuro respecto de la hora de recepción o anterior a 24 horas respecto de ella, sin almacenarla ni generar alertas o eventos.
- **FR-010**: El backend MUST descartar sin almacenar, alertar ni emitir eventos una lectura cuyo `ts` sea anterior a `reclamado_en` del dispositivo.
- **FR-011**: El backend MUST mantener el descarte de lecturas provenientes de dispositivos sin propietario, sin generar efectos derivados.
- **FR-012**: El backend MUST clasificar como diferida toda lectura válida cuyo atraso respecto de la hora de recepción sea mayor de cinco minutos.
- **FR-013**: El backend MUST almacenar las lecturas diferidas con su fecha de captura, pero MUST no evaluar sus umbrales, generar alertas ni emitir eventos en tiempo real.
- **FR-014**: Las lecturas con un atraso de cinco minutos o menos MUST conservar el comportamiento actual de evaluación de umbrales, alertas y eventos en tiempo real.
- **FR-015**: `ultima_conexion` del dispositivo MUST actualizarse con la hora de recepción de cada lectura aceptada, nunca con el `ts` de captura.
- **FR-016**: El endpoint de última lectura MUST seleccionar la lectura más reciente por fecha de captura, de modo que una lectura diferida no pueda reemplazar una más reciente.
- **FR-017**: El histórico agregado y la API pública MUST consultar y agregar por fecha de captura, no por fecha de recepción.
- **FR-018**: Una lectura diferida cuyo `ts` pertenezca a un mes anterior MUST almacenarse en la partición mensual correspondiente a su fecha de captura.
- **FR-019**: El tópico MQTT y el formato existente de lecturas sin `ts` MUST seguir siendo compatibles con dispositivos que todavía no envíen fecha de captura.
- **FR-020**: Las validaciones y descartes de `ts` MUST ser observables mediante los mecanismos de error y registro existentes, sin convertir un rechazo en una lectura almacenada exitosamente.

### Key Entities

- **Lectura**: Medición de un dispositivo, con sus valores, fecha de captura (`ts` cuando está disponible), fecha de recepción y estado de procesamiento diferido.
- **Buffer de lecturas**: Conjunto temporal en memoria del dispositivo, ordenado de la captura más antigua a la más nueva y limitado a 360 elementos.
- **Dispositivo**: Nodo identificado y reclamado por un propietario, con `reclamado_en` y `ultima_conexion`.
- **Lectura diferida**: Lectura válida recibida con más de cinco minutos de atraso, conservada para histórico pero excluida de efectos sobre el estado actual.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Después de un corte de WiFi o broker de al menos cinco minutos y menor o igual a una hora, el 100% de las lecturas dentro de las 360 posiciones del buffer aparece almacenado o queda explícitamente descartado solo por las reglas de validación definidas.
- **SC-002**: En una prueba de reconexión, el 100% de las lecturas recuperadas conserva su fecha de captura original y se consulta en orden cronológico, sin depender de la hora de recepción.
- **SC-003**: El 100% de las lecturas diferidas válidas no genera alertas ni eventos en tiempo real, mientras que las lecturas con atraso de cinco minutos o menos conservan el comportamiento actual.
- **SC-004**: El 100% de las lecturas con `ts` fuera del rango permitido o anterior a `reclamado_en` queda fuera de lecturas almacenadas, alertas y eventos.
- **SC-005**: La última lectura y `ultima_conexion` mantienen semánticas distintas en el 100% de los casos probados: la primera usa fecha de captura y la segunda hora de recepción.
- **SC-006**: Una lectura diferida con fecha de captura en el mes anterior aparece en el histórico de ese mes y no en el mes de recepción.
- **SC-007**: La suite automatizada del backend cubre cada regla de validación, almacenamiento, consultas y efectos diferidos, y permanece completamente verde sin pruebas omitidas.

## Assumptions

- El intervalo de captura por defecto es de 10 segundos y el buffer de 360 lecturas no cambia mediante configuración remota en esta entrega.
- La sincronización NTP del firmware y el canal MQTT con TLS de la spec 005 ya están disponibles; esta spec solo consume su estado de reloj sincronizado y no rediseña esos mecanismos.
- `reclamado_en` se registra al reclamar el dispositivo según la spec 004 y se utiliza como límite de aislamiento entre propietarios.
- La hora de recepción del backend es la referencia para validar el rango de `ts`, calcular el atraso y actualizar `ultima_conexion`.
- Las lecturas sin `ts` representan compatibilidad con dispositivos cuyo reloj aún no está sincronizado; no se consideran lecturas diferidas del buffer.
- El buffer no se persiste en flash, no sobrevive al reinicio y no se modifica la topología de tópicos, ACL, credenciales o TLS.
- La carrera entre transferencia de dispositivo y llegada de una lectura MQTT queda fuera de alcance, al igual que cualquier rediseño del frontend.
- Los límites de un minuto futuro, 24 horas de antigüedad y cinco minutos de atraso son inclusivos.
