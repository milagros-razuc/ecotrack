---
description: "Tareas para implementar el enrolamiento seguro de dispositivos EcoTrack"
---

# Tasks: Enrolamiento seguro de dispositivo

**Input**: Design documents from `specs/014-enrolar-dispositivo/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Dates**: funcionamiento punta a punta objetivo **2026-11-12**; presentación **2026-11-13**.

**Scope**: El firmware envía únicamente `device_id` y `device_secret`; el reclamo con código y token ocurre previamente en el dashboard. No guardar secretos en el repositorio, logs, auditoría ni argumentos de línea de comandos. No declarar resultados sin salida real.

**Remediación E3**: `removeDevice` debe compensar cliente y rol con intentos
independientes, tolerando únicamente respuestas de entidad inexistente. El
endpoint no usa JWT; `mqtt_host` se entrega desde `MQTT_PUBLIC_HOST`, separado
de `MQTT_HOST=mosquitto`. Si la compensación falla, el contrato observable es
un log sanitizado en stderr, no un incidente persistido.

- [X] T051 [P] Añadir tests de `removeDevice` para cliente inexistente/rol existente,
  ambos inexistentes y error real de dynamic-security.
- [X] T052 Corregir `removeDevice` para ejecutar bajas independientes y propagar
  errores reales; simplificar el catch redundante de `enrolamiento.service.js`.
- [X] T053 [P] Documentar y cablear `MQTT_PUBLIC_HOST` sin fijar su valor, y
  corregir la validación de `provision-device.js` para usar `\s`.
- [X] T054 Actualizar spec/plan/quickstart/contracts con el flujo provision-device
  seguido del reclamo dashboard, el origen de variables Compose y el contexto
  host/contenedor de `mosquitto_ctrl`.

## Phase 1: Setup

**Purpose**: Preparar contratos, secretos locales y cobertura de validación sin modificar firmware ni producción todavía.

- [ ] T001 [P] Documentar en `specs/014-enrolar-dispositivo/quickstart.md` las variables locales no versionadas (`DYNSEC_ADMIN_USER`, `DYNSEC_ADMIN_PASS`, `serverHost`, rutas de certificados) y confirmar que `.env*`, claves y certificados operativos están ignorados en `.gitignore`.
- [ ] T002 [P] Crear el esqueleto de evidencia sanitizada en `specs/014-enrolar-dispositivo/evidence/README.md`, incluyendo estados `Aprobado/Fallido/Pendiente`, salida real requerida y prohibición de secretos.
- [ ] T003 [P] Añadir casos de prueba A/B y doble de MQTT a la matriz de implementación en `specs/014-enrolar-dispositivo/contracts/enrollment-api.md`, sin registrar credenciales reales.

## Phase 2: Foundational — contratos y migraciones

**Purpose**: Dejar disponibles los invariantes de persistencia y seguridad antes del endpoint.

- [ ] T004 Revisar y consolidar la migración idempotente de `dispositivos_fabrica` en `backend/migrations/014_factory_devices.sql`, manteniendo `device_id VARCHAR(50) PRIMARY KEY`, `factory_secret_hash VARCHAR(64) UNIQUE NOT NULL`, `created_at` y `enrolled_at` nullable, sin secreto/PIN en claro.
- [ ] T005 [P] Añadir a `backend/src/config/migrate.js` la aplicación repetible de la tabla de fábrica y los índices/constraints necesarios para bloquear dos enrolamientos concurrentes del mismo `device_id`.
- [X] T006 [P] Añadir schemas de request/response con body exacto `device_id` + `device_secret` en `backend/src/schemas.js`, rechazando `activation_code`, `codigo`, `token`, `cliente_id` y campos adicionales con el error genérico.
- [ ] T007 Ejecutar la migración en una base de prueba y verificar con salida real que la tabla, hash, unicidad y nulabilidad de `enrolled_at` coinciden con `specs/014-enrolar-dispositivo/data-model.md`; no marcar la tarea si la base no está disponible.

**Checkpoint**: La tabla de fábrica y los contratos de entrada están verificados antes de implementar el endpoint.

## Phase 3: User Story 1 — Enrolar un dispositivo reclamado (Priority: P1)

**Goal**: Aceptar solo `device_id` + `device_secret` para un equipo previamente reclamado y devolver credenciales MQTT una sola vez.

**Independent Test**: Un dispositivo reclamado por cliente A recibe credenciales una vez; una repetición o un dispositivo no reclamado recibe el mismo error genérico sin credenciales.

### Tests for User Story 1

- [X] T008 [P] [US1] Crear tests unitarios del endpoint en `backend/src/test/enrolamiento-dispositivo.test.js` para body válido, campos extra, dispositivo desconocido, secreto inválido, dispositivo sin `cliente_id`, repetición y respuesta exitosa de entrega única.
- [X] T009 [P] [US1] Crear tests con doble de PostgreSQL/MQTT en `backend/src/test/enrolamiento-dispositivo.test.js` para cliente A y cliente B, verificando que `cliente_id` proviene del reclamo/estado persistido y nunca del body.

### Implementation for User Story 1

- [X] T010 Implementar la consulta transaccional y bloqueo por `device_id` en `backend/src/services/enrolamiento.service.js`, exigiendo `cliente_id` y `reclamado_en` y usando `crypto.timingSafeEqual` con buffers de igual longitud para comparar SHA-256.
- [X] T011 Implementar la ruta `POST /api/dispositivos/enrolar` en `backend/src/routes/enrolamiento.js` con HTTPS requerido, body exacto, error genérico `No se pudo enrolar el dispositivo` y rate limiter específico.
- [X] T012 Integrar la ruta en `backend/src/app.js` sin exponer `cliente_id` desde request input, preservando el flujo existente de reclamo y el aislamiento por cliente.
- [X] T013 Implementar la respuesta única en `backend/src/services/enrolamiento.service.js`, generando credenciales MQTT aleatorias, devolviéndolas solo en el éxito inicial y marcando `enrolled_at` sin persistir el password recuperable.
- [X] T014 Ejecutar la suite focalizada `backend/src/test/enrolamiento-dispositivo.test.js` y registrar en `specs/014-enrolar-dispositivo/evidence/` la salida real sanitizada antes de marcar completadas las tareas de la historia.

**Checkpoint**: La validación local y la entrega única funcionan con cliente A/B en dobles, sin secretos en salida.

## Phase 4: User Story 3 — Provisionamiento dynamic-security y rollback (Priority: P1)

**Goal**: Crear cliente/rol/ACL por dispositivo reutilizando el adaptador del script y compensar toda operación parcial.

**Independent Test**: Simular éxito, error, timeout y desconexión MQTT; verificar que no queda vínculo local sin identidad ni cliente/rol MQTT huérfano.

### Tests for User Story 3

- [ ] T015 [P] [US3] Extraer tests de respuestas correlacionadas, timeout, respuesta duplicada, error de autorización y desconexión del doble MQTT desde `scripts/provision-mqtt-dynamic.js` hacia `backend/src/test/dynamic-security.service.test.js`.
- [X] T016 [P] [US3] Añadir tests de rollback en `backend/src/test/enrolamiento-dispositivo.test.js` para fallo antes de crear cliente, fallo después de crear cliente/rol y fallo al persistir el vínculo local.

### Implementation for User Story 3

- [ ] T017 Extraer la lógica común de `scripts/provision-mqtt-dynamic.js` a `backend/src/services/dynamicSecurity.service.js`, manteniendo CA validada, `rejectUnauthorized: true`, correlación, timeout y credenciales desde entorno local.
- [X] T018 Implementar en `backend/src/services/dynamicSecurity.service.js` la secuencia determinista de rol/cliente con `publishClientSend ecotrack/<device_id>/lecturas allow`, `subscribePattern ecotrack/# deny` prioridad 0 y `subscribePattern ecotrack/<device_id>/# allow` prioridad 10.
- [X] T019 Implementar compensación en `backend/src/services/enrolamiento.service.js` para borrar/revocar cliente y rol si falla el commit local; registrar solo un log sanitizado en stderr si la compensación no es confirmable.
- [ ] T020 Rehacer `scripts/provision-mqtt-dynamic.js` como wrapper reproducible del servicio compartido, preservando alta repetible, baja y códigos de salida sin imprimir passwords ni payloads.
- [X] T021 [US3] Ejecutar tests unitarios del adaptador y rollback, y verificar con salida real que una falla no deja credenciales, roles o vínculos huérfanos en el doble.

**Checkpoint**: Endpoint y script comparten exactamente la lógica de dynamic-security y el rollback está cubierto.

## Phase 5: User Story 2 — Export de fábrica y rechazos uniformes (Priority: P1)

**Goal**: Alimentar la tabla de fábrica con `device_id` + hash sin secreto/PIN y hacer indistinguibles los rechazos.

**Independent Test**: Exportar dos dispositivos y verificar que el archivo contiene solo columnas permitidas; comparar status/body/logs de todos los rechazos y rate limit.

### Tests for User Story 2

- [ ] T022 [P] [US2] Añadir tests en `tests/provision_factory_test.py` que comprueben que `--export-backend` no contiene secreto, PIN ni clave SoftAP y que la primera fila de la NVS sigue siendo el namespace.
- [ ] T023 [P] [US2] Añadir tests de errores uniformes y rate limit en `backend/src/test/enrolamiento-dispositivo.test.js`, comparando status, estructura y mensaje para body inválido, secreto incorrecto, no reclamado, ya enrolado y límite excedido.
- [ ] T024 [P] [US2] Añadir una aserción de sanitización en `backend/src/test/enrolamiento-dispositivo.test.js` para confirmar que secretos, tokens y passwords no aparecen en logs ni auditoría.

### Implementation for User Story 2

- [ ] T025 Implementar o ajustar `--export-backend` en `scripts/provision_factory.py` para producir fuera del repositorio únicamente `device_id`, `factory_secret_hash` y metadatos no sensibles, sin secreto, PIN ni clave SoftAP.
- [ ] T026 Integrar `backend/migrations/014_factory_devices.sql` con el import reproducible del export y documentar el procedimiento en `README.MD`, incluyendo rutas externas y permisos.
- [ ] T027 Implementar el rate limiter específico y la respuesta uniforme en `backend/src/middleware/rateLimiter.js` y `backend/src/routes/dispositivos.js`, sin `skipSuccessfulRequests` y sin registrar valores sensibles.
- [ ] T028 Ejecutar tests de exportación, errores uniformes, rate limit y sanitización; guardar salida real en `specs/014-enrolar-dispositivo/evidence/`.

**Checkpoint**: La tabla puede cargarse desde un export seguro y todas las categorías de rechazo tienen la misma respuesta pública.

## Phase 6: User Story 4 — HTTPS 443 con Caddy en desarrollo (Priority: P1)

**Goal**: Exponer el endpoint en Caddy 443 para desarrollo, con CA interna
persistente y sin exponer backend:3000 al exterior.

**Independent Test**: Emitir certificado fuera del repo, verificar cadena/SAN contra la CA embebida y ejecutar un request HTTPS al proxy.

### Tests for User Story 4

- [X] T029 [P] [US4] Documentar la exportación de la CA interna de Caddy y
  verificarla con `curl.exe --cacert`, sin `-k`.
- [X] T030 [P] [US4] Añadir test unitario que confirme `req.secure` con
  `trust proxy` restringido a un salto y `X-Forwarded-Proto: https`.

### Implementation for User Story 4

- [X] T031 Crear `caddy/Caddyfile` con `tls internal` y proxy a `backend:3000`.
- [X] T032 [P] Añadir servicio Caddy a `docker-compose.yml`, volumen nombrado
  `caddy_data` y puerto 443; eliminar la publicación externa de 3000.
- [ ] T033 Integrar y ejecutar la verificación TLS/proxy con Docker; registrar salida
  real de CA, HTTP status y exposición de puertos en `specs/014-enrolar-dispositivo/evidence/`.

**Checkpoint**: HTTPS 443 funciona con la CA del firmware y el puerto 3000 no está expuesto externamente.

## Phase 7: User Story 1 — Firmware con enrolamiento y backoff (Priority: P1)

**Goal**: Cuando no hay credenciales MQTT guardadas, el ESP32 solicita enrolamiento por HTTPS validado, guarda credenciales y conecta MQTT sin bloquear lecturas.

**Independent Test**: Con NVS sin credenciales, el firmware envía solo los dos campos, valida la CA, guarda la respuesta una vez y reintenta errores con backoff 3/6/... hasta 60 segundos sin reabrir el portal.

### Tests for User Story 1

- [ ] T035 [P] [US1] Añadir tests de parsing/validación del payload de enrolamiento y preservación de la primera fila namespace en `codigo-esp32-mosquitto/tests/enrollment_client_test.cpp`.
- [ ] T036 [P] [US1] Añadir tests de backoff no bloqueante, tope de 60 segundos, no reapertura del portal y ausencia de secretos en Serial en `codigo-esp32-mosquitto/tests/enrollment_client_test.cpp`.

### Implementation for User Story 1

- [ ] T037 Implementar cliente HTTPS en `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino`/helper separado para enviar únicamente `device_id` y `device_secret` a `/api/dispositivos/enrolar` por `serverHost:443`, usando `ecotrack_ca.h` y sin `setInsecure()`.
- [ ] T038 Guardar `mqtt_user`/`mqtt_pass` recibidos en NVS namespace `ecotrack`, preservando `device_id`, `device_secret` y la primera fila namespace en `codigo-esp32-mosquitto/DeviceConfig.cpp`.
- [ ] T039 Integrar el estado de enrolamiento con la conexión MQTT TLS 8883, evitando reabrir el portal y sin imprimir secretos en `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino`.
- [ ] T040 Implementar backoff creciente no bloqueante de 3 segundos hasta 60 segundos en el loop de firmware, sin detener lecturas ni modificar el payload MQTT en `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino`.
- [ ] T041 Ejecutar tests/build del firmware disponibles y guardar salida real de compilación, tests y revisión de Serial en `specs/014-enrolar-dispositivo/evidence/`.

**Checkpoint**: El dispositivo puede pasar de NVS sin MQTT a credenciales MQTT persistidas sin portal en bucle y con backoff acotado.

## Phase 8: Prueba física punta a punta y presentación

**Purpose**: Validar el flujo real sin inventar resultados y preparar la evidencia del 13/11.

- [ ] T042 Preparar dos dispositivos físicos y reclamar previamente uno para cliente A y otro para cliente B usando el flujo existente, registrando solo identificadores sanitizados en `specs/014-enrolar-dispositivo/evidence/`.
- [ ] T043 Ejecutar el flujo físico completo del 2026-11-12: WiFi, HTTPS 443, enrolamiento, persistencia NVS, MQTT TLS 8883 y publicación propia de A/B; guardar salida real y timestamps en `specs/014-enrolar-dispositivo/evidence/e2e-2026-11-12.md`.
- [ ] T044 Ejecutar la matriz física cruzada: publicación y suscripción de A sobre B y de B sobre A deben fallar; registrar resultado real del broker y del dispositivo sin secretos en `specs/014-enrolar-dispositivo/evidence/e2e-2026-11-12.md`.
- [ ] T045 Crear `specs/014-enrolar-dispositivo/evidence/final-report.md` con estado `Aprobado/Fallido/Pendiente`, criterios, comandos, versiones, hashes de configuración, fallos y limitaciones, sin declarar resultados no ejecutados.
- [ ] T046 Preparar la presentación del 2026-11-13 en `specs/014-enrolar-dispositivo/evidence/presentation-checklist.md`, enlazando únicamente evidencia real y dejando explícitos los casos no ejecutados.

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T047 [P] Actualizar `README.MD` con el contrato del endpoint, export seguro, comandos de certificado, Caddy 443, variables locales y advertencias de secretos.
- [ ] T048 [P] Revisar `docker-compose.yml`, Caddy, scripts, backend, firmware y documentación para confirmar que no se agregaron secretos, PINs, tokens completos, passwords MQTT ni claves privadas al repositorio.
- [ ] T049 Ejecutar la suite focalizada de backend, tests de provisioning, validación de Compose, smoke HTTPS y tests/build de firmware disponibles; registrar cada salida real y fallos en `specs/014-enrolar-dispositivo/evidence/final-report.md`.
- [ ] T050 Verificar que todas las tareas requeridas para funcionamiento del 2026-11-12 tienen evidencia real y que la presentación del 2026-11-13 no afirma resultados no ejecutados.

## Dependencies & Execution Order

### Requested delivery order

1. **T004–T007**: migración y tabla de fábrica.
2. **T008–T014**: endpoint y tests A/B con doble MQTT.
3. **T022–T028**: export seguro de fábrica y rechazos uniformes.
4. **T015–T021**: reutilización dynamic-security y rollback.
5. **T029–T034**: Caddy 443 y CA interna de desarrollo.
6. **T035–T041**: firmware, NVS, CA y backoff.
7. **T042–T046**: prueba física y presentación.

### Phase dependencies

- **Setup**: T001–T003 no dependen de implementación.
- **Foundational**: T004–T007 debe completarse antes de ejecutar el endpoint.
- **US1 endpoint**: T008–T014 depende de la migración y contratos.
- **US2 export/rechazos**: T022–T028 usa la tabla de fábrica y el endpoint.
- **US3 dynamic-security**: T015–T021 debe quedar integrado antes de declarar éxito del endpoint; sus tests pueden comenzar con el contrato, pero la ejecución final depende de T010.
- **US4 HTTPS**: T029–T034 puede prepararse en paralelo con US2/US3, pero el smoke test depende del endpoint y Compose.
- **US1 firmware**: T035–T041 depende del contrato HTTPS, endpoint y certificado.
- **E2E**: T042–T046 depende de todas las fases anteriores.
- **Polish**: T047–T050 depende de los entregables que documenta y valida.

### Parallel opportunities

- T001–T003 son paralelizables.
- T005 y T006 son paralelizables después de revisar T004.
- T008–T009 son paralelizables antes de T010.
- T015–T016 son paralelizables; T017–T018 comparten adaptador y son secuenciales.
- T022–T024 son paralelizables; T025–T027 comparten contrato de export/rate limit y luego requieren T028.
- T029–T033 pueden prepararse en paralelo; T034 es secuencial.
- T035–T036 son paralelizables; T037–T040 comparten firmware y son secuenciales.
- T047–T048 son paralelizables; T049–T050 son secuenciales.

## Implementation Strategy

### MVP first

1. **MVP técnico**: T004–T021 — tabla, endpoint, doble MQTT, dynamic-security, ACL y rollback.
2. **MVP integrable**: T022–T034 — export seguro, errores uniformes, Caddy 443 y CA interna de desarrollo.
3. **MVP de dispositivo**: T035–T041 — enrolamiento HTTPS, NVS, MQTT TLS y backoff.
4. **Aceptación**: T042–T046 — evidencia física antes del 2026-11-12 y presentación del 2026-11-13.

### Definition of done

- Todas las tareas necesarias para el flujo se marcan `[X]` únicamente después de su verificación real.
- Ningún resultado `Aprobado` se escribe sin salida real, especialmente para la prueba física.
- Los secretos permanecen fuera del repositorio y no aparecen en logs, auditoría, argumentos ni reportes.
