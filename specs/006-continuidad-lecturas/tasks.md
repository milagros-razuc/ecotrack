---
description: "Task list for continuidad de lecturas y fecha de captura"
---

# Tasks: Continuidad de lecturas y fecha de captura

**Input**: Design documents from `/specs/006-continuidad-lecturas/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`,
`quickstart.md`

**Tests**: TDD requerido por la especificación y por la solicitud; cada regla backend se prueba
antes de implementar su comportamiento.

## Phase 1: Setup

**Purpose**: Preparar únicamente los artefactos de prueba y el alcance de implementación.

- [X] T001 Confirmar que `TEST_DATABASE_URL` apunta a una base PostgreSQL aislada y que `backend/src/test/continuidad-lecturas.integration.test.js` usa la convención de fixtures existente sin modificar credenciales ni `esp32Secret.h`.

## Phase 2: Foundational

**Purpose**: Establecer los helpers de prueba compartidos para una hora de recepción controlable,
particiones mensuales y observación de eventos, sin cambiar todavía la lógica productiva.

- [X] T002 Añadir en `backend/src/test/continuidad-lecturas.integration.test.js` helpers para publicar payloads MQTT mediante `procesarMensaje`, consultar lecturas/alertas/dispositivo y esperar eventos Socket.IO con una referencia temporal fija.
- [X] T003 Añadir en `backend/src/test/continuidad-lecturas.integration.test.js` fixtures para dispositivos reclamados y sin propietario, `reclamado_en`, umbrales y API key de un cliente, reutilizando el aislamiento de `realtime.test-support.js`.

## Phase 3: Backend — captura, validación y efectos diferidos (US1, US2, US3) 🎯 MVP

**Goal**: Aceptar `ts` opcional con fecha de captura correcta, aislar lecturas anteriores al
reclamo, conservar `ultima_conexion` por recepción y evitar efectos actuales para lecturas
diferidas.

**Independent Test**: Ejecutar solo `backend/src/test/continuidad-lecturas.integration.test.js`
contra `TEST_DATABASE_URL`; cada prueba verifica persistencia, descarte o efectos observables
sin depender del firmware.

### Tests first — deben fallar antes de la implementación

- [X] T004 [US1] Escribir en `backend/src/test/continuidad-lecturas.integration.test.js` la prueba de `ts` válido que verifica que `lecturas.timestamp` coincide con el Unix UTC recibido y no con la hora de llegada.
- [X] T005 [US1] Escribir en `backend/src/test/continuidad-lecturas.integration.test.js` las pruebas de `ts` futuro mayor de un minuto y anterior a 24 horas, verificando que no se almacenan ni generan alertas o eventos.
- [X] T006 [US1] Escribir en `backend/src/test/continuidad-lecturas.integration.test.js` las pruebas de límites inclusivos: `ts` exactamente recepción más un minuto y exactamente recepción menos 24 horas son aceptados.
- [X] T007 [US1] Escribir en `backend/src/test/continuidad-lecturas.integration.test.js` la prueba de `ts` anterior a `reclamado_en`, verificando descarte sin lectura, alerta, evento ni actualización de actividad de un propietario nuevo.
- [X] T008 [US1] Escribir en `backend/src/test/continuidad-lecturas.integration.test.js` las pruebas de atraso exactamente de cinco minutos y mayor de cinco minutos, verificando que solo la segunda omite umbrales, alertas y evento `lectura`.
- [X] T009 [US1] Escribir en `backend/src/test/continuidad-lecturas.integration.test.js` la prueba de payload sin `ts`, verificando almacenamiento con recepción y compatibilidad con el formato anterior.
- [X] T010 [US2] Escribir en `backend/src/test/continuidad-lecturas.integration.test.js` la prueba de `ultima_conexion`, verificando que conserva la hora de recepción y no el `ts` de captura.
- [X] T011 [US2] Escribir en `backend/src/test/continuidad-lecturas.integration.test.js` la prueba de última lectura por dispositivo, insertando una reciente y luego una diferida para verificar que la diferida no pisa la más reciente.
- [X] T012 [US2] Escribir en `backend/src/test/continuidad-lecturas.integration.test.js` las pruebas de listado, histórico agregado y API pública, verificando orden, filtros y agrupación por `lecturas.timestamp`.
- [X] T013 [US2] Escribir en `backend/src/test/continuidad-lecturas.integration.test.js` la prueba de una lectura diferida con `ts` en el mes anterior, verificando que se almacena en la partición mensual y agregado de captura, no de recepción.
- [X] T014 [US1] Escribir en `backend/src/test/continuidad-lecturas.integration.test.js` la prueba de una lectura de dispositivo sin propietario, verificando que mantiene el descarte existente sin lecturas, alertas ni eventos.
- [X] T015 [US1] Ejecutar solo las pruebas T004–T014 y confirmar que fallan por ausencia del comportamiento nuevo, sin marcar ninguna como omitida.

### Implementation

- [X] T016 [US1] Extender `backend/src/schemas.js` para aceptar `ts` opcional como entero Unix en segundos, preservando los campos y rangos físicos existentes y rechazando tipos inválidos.
- [X] T017 [US1] Implementar en `backend/src/services/lecturas.service.js` la inserción con `timestamp` de captura o recepción y el `cliente_id` del propietario, además de exponer consultas ordenadas por fecha de captura para listado, última lectura y agregado.
- [X] T018 [US1] Implementar en `backend/src/services/dispositivos.service.js` la actualización explícita de `ultima_conexion` con la hora de recepción y la lectura de `reclamado_en`, sin convertir descartes en actividad válida.
- [X] T019 [US1] Actualizar `backend/src/mqtt/client.js` para capturar una sola hora de recepción, validar el rango inclusivo `[recepción-24h, recepción+1min]`, resolver `ts` o recepción, descartar fechas anteriores a `reclamado_en` y conservar el descarte de dispositivos sin dueño.
- [X] T020 [US3] Actualizar `backend/src/mqtt/client.js` para clasificar atraso `> 5 minutos` después de persistir y omitir `io.emit('lectura')`, evaluación de umbrales y alertas; mantener todos esos efectos para atraso `<= 5 minutos`.
- [X] T021 [US1] Actualizar `backend/src/config/migrate.js` para asegurar de forma idempotente las particiones del mes anterior, actual y siguiente de `lecturas` por `timestamp`, cubriendo una lectura diferida que cruza de mes.
- [X] T022 [US1] Ejecutar T004–T014 después de T016–T021 y corregir solo los fallos directamente relacionados hasta que todas las reglas backend pasen sin omisiones.

**Checkpoint**: El backend debe aceptar payloads antiguos y nuevos, persistir por captura,
aislar propietarios, manejar particiones mensuales y diferenciar lecturas recientes de diferidas.

## Phase 4: Firmware — buffer volátil y publicación con captura (US1)

**Goal**: Continuar capturando durante una desconexión y transferir hasta 360 lecturas FIFO
conservando `ts` cuando NTP está disponible.

**Independent Test**: Compilar el sketch y ejecutar la verificación manual documentada en
`specs/006-continuidad-lecturas/quickstart.md`; no requiere modificar el backend fuera de las
reglas ya cubiertas en la fase anterior.

- [X] T023 [US1] Añadir en `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino` la estructura de entrada y buffer circular en RAM con capacidad fija de 360 lecturas (`ts`, `temperatura`, `humedad`, `luminosidad`), descartando la más antigua al llenarse y perdiéndolo al reiniciar.
- [X] T024 [US1] Actualizar `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino` para capturar continuamente aunque MQTT no esté conectado, publicar `ts = time(nullptr)` solo cuando `ntpReady` sea verdadero y omitir `ts` cuando NTP no esté sincronizado sin guardar esa lectura en el buffer diferido.
- [X] T025 [US1] Implementar en `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino` el vaciado FIFO al reconectar, retirando cada entrada solo tras `mqtt.publish` exitoso, llamando `mqtt.loop()` entre mensajes, usando una pausa breve y retomando luego la publicación normal.
- [X] T026 [US1] Ajustar en `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino` el tamaño máximo de `PubSubClient` para el payload con `ts`, sin cambiar tópico, TLS, ACL, credenciales ni `esp32Secret.h`.

## Phase 5: Documentation

**Goal**: Documentar únicamente el contrato y la operación de continuidad, sin rediseñar frontend,
ACL, TLS, tópicos ni configuración remota.

- [ ] T027 [P] [US3] Actualizar `README.MD` con el campo opcional `ts`, semántica de fecha de captura, límites de validación, lecturas diferidas y buffer volátil de 360 entradas.
- [ ] T028 [P] [US3] Actualizar `specs/006-continuidad-lecturas/quickstart.md` con los comandos de prueba backend, la consulta de partición mensual y el procedimiento manual de corte/reconexión de WiFi o broker.
- [ ] T029 [P] [US3] Revisar `docs/requisitos.md` y la documentación de la spec 006 para que RF22, RF23, RNF18 y RNF22 queden trazables, sin agregar requisitos fuera de alcance.

## Phase 6: Polish & Cross-Cutting Validation

- [ ] T030 Ejecutar la suite completa desde `backend/` con `TEST_DATABASE_URL` mediante `npm test`, sin tests omitidos, y resolver regresiones de la funcionalidad existente.
- [ ] T031 Revisar `git status` y `.gitignore` para confirmar que no se versionan `codigo-esp32-mosquitto/esp32Secret.h`, claves privadas, certificados sensibles ni archivos de entorno; no modificar ni crear secretos.
- [ ] T032 Ejecutar el procedimiento manual de `specs/006-continuidad-lecturas/quickstart.md` con una placa ESP32: cortar WiFi o detener el broker varios minutos, confirmar captura continua, reconectar, consultar PostgreSQL por orden/timestamp original y comprobar ausencia de alertas y eventos en vivo para diferidas.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: independiente; prepara la base y el entorno de pruebas.
- **Foundational (Phase 2)**: depende de T001 y bloquea las pruebas backend.
- **Backend (Phase 3)**: T004–T015 deben completarse antes de T016–T021; T022 depende de toda la implementación.
- **Firmware (Phase 4)**: depende de T022 y reutiliza el contrato MQTT validado.
- **Documentation (Phase 5)**: puede ejecutarse después de que contratos y decisiones estén estabilizados; T027–T029 son paralelizables entre sí.
- **Polish (Phase 6)**: T030–T032 dependen de backend, firmware y documentación; T030 y T031 pueden ejecutarse en paralelo con T032 si la placa está disponible.

### User Story Dependencies

- **US1 — Continuidad y backend de ingesta**: T001–T010, T014–T026; es el MVP y debe completarse antes de la validación manual.
- **US2 — Consultas por fecha de captura**: T011–T013 y T017–T021; depende de los helpers fundacionales, no del firmware.
- **US3 — Lecturas diferidas y documentación**: T008, T020, T027–T029; la documentación depende de las semánticas backend, pero no agrega comportamiento.

### Parallel Opportunities

- T002 y T003 pueden ejecutarse en paralelo después de T001.
- T004–T014 pueden escribirse en paralelo por grupos, siempre dentro del mismo archivo y coordinando no duplicar helpers.
- T027, T028 y T029 pueden ejecutarse en paralelo una vez fijado el contrato.
- T030 y T031 pueden ejecutarse en paralelo; T032 requiere hardware y puede correr simultáneamente.

## Implementation Strategy

1. **MVP**: Completar T001–T022 para que el backend preserve lecturas, valide `ts`, aísle
   propietarios y suprima efectos de lecturas diferidas.
2. **Incremento de dispositivo**: Completar T023–T026 y validar el buffer FIFO con una placa.
3. **Documentación y aceptación**: Completar T027–T032, ejecutar la suite completa y conservar
   evidencia de la verificación manual.
