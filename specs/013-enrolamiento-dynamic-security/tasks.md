---
description: "Tareas para validar el spike de Mosquitto Dynamic Security con ACL por dispositivo"
---

# Tasks: Spike de Mosquitto Dynamic Security

**Input**: Design documents from `specs/013-enrolamiento-dynamic-security/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/dynamic-security-control.md](contracts/dynamic-security-control.md), [quickstart.md](quickstart.md)

**Scope**: Spike reversible. No migración masiva de dispositivos, no enrolamiento automático y no declaración de éxito sin evidencia real. **Corte duro: 2026-11-06.**

## Phase 1: Setup

**Purpose**: Preparar variables, rutas y snapshots sin introducir secretos en Git.

- [ ] T001 Crear un archivo local no versionado con host, puerto 8883, CA, usuario/clave admin y credenciales de dos dispositivos de prueba, y validar que sus nombres no existan en `mosquitto/config/passwd`.
- [ ] T002 [P] Crear el directorio de evidencia local fuera de Git y definir el formato sanitizado de logs, hashes de configuración y resultados en `specs/013-enrolamiento-dynamic-security/`.
- [X] T003 [P] Crear un snapshot local de `mosquitto/config/mosquitto.conf`, `mosquitto/config/acl.conf`, `mosquitto/config/passwd` y `docker-compose.yml` para permitir rollback de un comando.

## Phase 2: Foundational — broker, TLS y persistencia

**Purpose**: Dejar disponible el broker dynamic-security antes de ejecutar altas.

- [ ] T004 Inspeccionar en la imagen `eclipse-mosquitto:2` la ruta real de `mosquitto_dynamic_security.so` y hacer que `mosquitto/Dockerfile` falle explícitamente si el plugin no está disponible.
- [X] T005 Habilitar `plugin`, `plugin_opt_config_file` apuntando a `/mosquitto/data/dynamic-security.json` y `per_listener_settings false` en `mosquitto/config/mosquitto.conf`, conservando TLS 8883, `password_file` y `acl_file`.
- [X] T006 Configurar en `docker-compose.yml` la persistencia escribible de `dynamic-security.json` en `mosquitto_data` y el montaje de certificados/secretos locales sin versionar.
- [X] T007 [P] Crear una plantilla sin secretos para la configuración inicial dynamic-security en `mosquitto/config/dynamic-security.json.example` y documentar que el estado real no se versiona.
- [ ] T008 Construir y arrancar el servicio Mosquitto, verificar que el plugin carga, que el archivo dinámico se crea o persiste y que el listener TLS 8883 valida la CA; guardar evidencia sanitizada.

**Checkpoint**: El broker carga dynamic-security con TLS y persistencia, o el spike se marca como bloqueado sin continuar con altas.

## Phase 3: User Story 1 — Alta dinámica de cliente, rol y ACL (Priority: P1) 🎯 MVP

**Goal**: Crear una identidad dinámica por dispositivo limitada a su propio topic.

**Independent Test**: Con el broker TLS operativo y el admin configurado, crear un dispositivo de prueba y verificar mediante respuesta correlacionada que existen cliente, rol y ACL exactos.

### Tests for User Story 1

- [X] T009 [P] [US1] Crear tests unitarios con doble de `mqtt` para conexión TLS validada, suscripción previa a `$CONTROL/dynamic-security/v1/response`, correlación por `correlationData`, timeout, respuesta duplicada/malformada y respuesta con `error` en `backend/src/test/dynamic-security.test.js`.
- [X] T010 [P] [US1] Crear test de contrato para la secuencia `createRole`, `addRoleACL`, `createClient` y ACL verificando `publishClientSend` solo sobre `ecotrack/<deviceId>/lecturas` en `backend/src/test/dynamic-security.test.js`.

### Implementation for User Story 1

- [X] T011 [US1] Implementar el adaptador de control MQTT con CA, `rejectUnauthorized`, topic de control y respuesta correlacionada en `backend/src/services/dynamicSecurity.service.js`, sin registrar secretos ni payloads sensibles.
- [X] T012 [US1] Implementar validación de `deviceId`, nombres dinámicos no duplicados con `passwd`, generación segura de credenciales y compensación para roles parciales en `backend/src/services/dynamicSecurity.service.js`.
- [X] T013 [US1] Crear el script reproducible de alta/baja que consuma configuración local, ejecute cliente/rol/ACL, detecte duplicados y devuelva código no cero ante errores en `scripts/provision-mqtt-dynamic.js`.
- [X] T014 [US1] Crear la identidad administrativa inicial del backend mediante el mecanismo de inicialización de dynamic-security, documentando el secreto fuera de Git y limitando sus permisos al namespace `$CONTROL/dynamic-security/#`.
- [X] T015 [US1] Ejecutar el script de alta para dos dispositivos de prueba y guardar únicamente respuestas, usernames, topics y estados sanitizados en la evidencia de `specs/013-enrolamiento-dynamic-security/`.

**Checkpoint**: Dos clientes dinámicos tienen roles/ACL verificables y ningún secreto aparece en archivos versionados o evidencia.

## Phase 4: User Story 2 — Verificación de aislamiento y convivencia (Priority: P1)

**Goal**: Probar que cada identidad publica solo en su topic y no puede publicar ni suscribirse al topic de otro dispositivo, manteniendo operativos los usuarios estáticos.

**Independent Test**: Ejecutar la matriz A/B con TLS real y comprobar seis resultados: dos publicaciones propias permitidas, dos publicaciones cruzadas rechazadas y dos suscripciones cruzadas rechazadas; repetir una conexión estática existente.

### Tests for User Story 2

- [X] T016 [P] [US2] Crear el script reproducible de verificación MQTT TLS para clientes A/B, con expectativas de publish/subscribe permitido o rechazado, timeout por operación y salida no cero ante cualquier desviación, en `scripts/verify-mqtt-dynamic-security.js`.
- [ ] T017 [P] [US2] Añadir cobertura del baseline estático y la convivencia `DEFER` usando la configuración de prueba en `mosquitto/config/mosquitto.test.conf` y `mosquitto/config/acl.test.conf`, sin reutilizar usernames dinámicos.

### Implementation for User Story 2

- [X] T018 [US2] Implementar en `scripts/verify-mqtt-dynamic-security.js` la matriz completa de `TEST-A`/`TEST-B` según `contracts/dynamic-security-control.md`, validando que las denegaciones ocurren en broker y no por un falso positivo del cliente.
- [ ] T019 [US2] Documentar y probar la precedencia observada entre dynamic-security y `password_file`/`acl_file`, confirmando que los usuarios estáticos siguen autenticando y que ningún username existe en ambos mecanismos.
- [ ] T020 [US2] Ejecutar el quickstart de Docker/TLS con dos dispositivos, conservar versión de Mosquitto, digest de imagen, hashes de configuración y logs sanitizados en la evidencia de `specs/013-enrolamiento-dynamic-security/`.

**Checkpoint**: El aislamiento A/B y la convivencia mínima pasan con evidencia real; si falla cualquier caso, el resultado no puede ser `Aprobado`.

## Phase 5: User Story 3 — Migración mínima, rollback y decisión del spike (Priority: P1)

**Goal**: Poder volver a la configuración estática con un solo comando y clasificar el spike antes del 2026-11-06.

**Independent Test**: Ejecutar rollback desde un entorno dynamic-security, verificar que el broker vuelve a usar la configuración estática y repetir la prueba ACL baseline; luego consolidar un reporte sin inventar resultados.

### Implementation for User Story 3

- [X] T021 [P] [US3] Crear `scripts/revert-mqtt-dynamic.ps1` que detenga el broker, restaure el snapshot de `mosquitto.conf`, `acl.conf`, `passwd` y `docker-compose.yml`, y arranque la configuración estática anterior sin borrar certificados ni secretos fuera de Git.
- [X] T022 [P] [US3] Documentar en `specs/013-enrolamiento-dynamic-security/quickstart.md` la migración mínima, la convivencia, el comando para listar usernames que deben excluirse de duplicación y el comando único de rollback. La lista real y la convivencia aún requieren evidencia local.
- [ ] T023 [US3] Ejecutar rollback y validar que el usuario backend estático y los dispositivos estáticos recuperan el comportamiento baseline; registrar la salida real y cualquier diferencia en la evidencia.
- [X] T024 [US3] Crear el reporte de resultado en `specs/013-enrolamiento-dynamic-security/evidence/report.md` con estado `Pendiente`, resultados A/B disponibles, gates aún sin evidencia y causas, sin secretos. Completar entorno, versión y rollback al ejecutar los gates pendientes.
- [ ] T025 [US3] Aplicar el corte duro del 2026-11-06: conservar dynamic-security solo si todos los criterios pasan; si no, ejecutar rollback, marcar `Fallido` o `Pendiente` según evidencia y documentar la mejora futura 8.2 en `specs/013-enrolamiento-dynamic-security/evidence/report.md`.

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T026 [P] Actualizar `README.MD` con prerequisitos, variables locales, comandos de alta/verificación/rollback y advertencias de secretos.
- [X] T027 [P] Revisar `mosquitto/config`, scripts y evidencia para confirmar que no se agregaron contraseñas, hashes sensibles, tokens ni contenido de `dynamic-security.json` al repositorio.
- [ ] T028 Ejecutar `node --test --test-timeout=30000 --test-concurrency=1 backend/src/test/dynamic-security.test.js`, la prueba ACL existente y la validación de `quickstart.md`; registrar la salida sin convertir una prueba omitida en aprobación.

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: sin dependencias; T001–T003 preparan secretos locales, evidencia y snapshot.
- **Phase 2 (Foundational)**: depende de Phase 1; T004–T008 bloquean las altas si el plugin, TLS o persistencia no funcionan.
- **Phase 3 (US1)**: depende de Phase 2; implementa el admin y el alta dinámica.
- **Phase 4 (US2)**: depende de T013–T015; verifica permisos dinámicos y convivencia estática.
- **Phase 5 (US3)**: depende de Phase 4; ejecuta rollback y fija la decisión antes del 2026-11-06.
- **Phase 6 (Polish)**: depende de las fases anteriores y del resultado real del spike.

### User Story Dependencies

- **US1**: habilitada por la infraestructura foundational; entrega el MVP de alta dinámica.
- **US2**: depende de US1 para disponer de dos clientes/roles; mantiene una verificación independiente del aislamiento.
- **US3**: depende de US2 para decidir si conserva o revierte la configuración.

### Parallel Opportunities

- Phase 1: T002 y T003 pueden ejecutarse en paralelo con T001 si no modifican los mismos archivos.
- Phase 2: T007 puede ejecutarse en paralelo con T004–T006; T008 espera toda la configuración.
- US1: T009 y T010 son paralelizables antes de T011–T013; T014 puede prepararse en paralelo con los tests, pero T015 espera el alta implementada.
- US2: T016 y T017 son paralelizables; T018–T020 esperan sus contratos.
- US3: T021 y T022 son paralelizables; T023–T025 son secuenciales.
- Polish: T026 y T027 pueden ejecutarse en paralelo; T028 espera los cambios finales.

## Implementation Strategy

### MVP First

1. Completar T001–T008 para contar con broker dynamic-security TLS verificable.
2. Completar T009–T015 para crear un cliente/rol/ACL por dispositivo.
3. Ejecutar T016–T020 para probar aislamiento A/B.
4. Completar T021–T025 para rollback y decisión del corte.

### Incremental Delivery

- Entrega 1: broker y admin configurados, sin secretos versionados.
- Entrega 2: alta dinámica reproducible con respuestas correlacionadas.
- Entrega 3: verificación propia/cruzada y convivencia estática.
- Entrega 4: rollback de un comando y reporte final basado en evidencia.

**MVP**: T001–T015, únicamente alta dinámica reproducible y verificable; no se
considera aceptación del spike sin T016–T025.
