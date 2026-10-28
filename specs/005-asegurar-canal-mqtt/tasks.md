---

description: "Task list for securing the MQTT channel"
---

# Tasks: Asegurar canal MQTT

**Input**: Design documents from `/specs/005-asegurar-canal-mqtt/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Scope**: Alcance mínimo de ACL, TLS, NTP, certificados, SAN y documentación. No se incluyen
cambios de ACL/credenciales, cambios de tópico/payload, mTLS ni refactors fuera de alcance. La
continuidad de lecturas y el campo `ts` corresponden al spec 006.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar el material de confianza y la estructura local sin versionar secretos.

- [X] T001 [P] Añadir reglas para excluir `*.key`, certificados generados de servidor y archivos locales de credenciales en `.gitignore`
- [X] T002 [P] Crear el directorio documentado para certificados públicos y locales en `mosquitto/config/certs/` y `codigo-esp32-mosquitto/certs/`
- [X] T003 [P] Documentar en `scripts/generate-mqtt-certs.ps1` los comandos OpenSSL para generar la CA autofirmada, el certificado del broker y la clave privada fuera de Git
- [X] T004 [P] Incluir en `scripts/mqtt-broker-san.cnf` los SAN `DNS:mosquitto`, `DNS:localhost` y `IP:<IP_DEL_HOST>` usados por backend y ESP32, sin incluir claves privadas

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Habilitar un único canal MQTT TLS reproducible que puedan usar todas las historias.

- [X] T005 Configurar el listener TLS exclusivo en `mosquitto/config/mosquitto.conf` con puerto `8883`, `cafile`, `certfile`, `keyfile`, TLS 1.2 como mínimo, `allow_anonymous false` y las rutas de autenticación/ACL existentes; eliminar el listener `1883`
- [X] T006 Ajustar `docker-compose.yml` para publicar únicamente `8883:8883`, montar certificados TLS de Mosquitto y conservar el volumen de datos y el servicio existente
- [X] T007 Ajustar `mosquitto/Dockerfile` para copiar la configuración y el CA/certificado público requeridos, mantener la clave privada como montaje local ignorado y preservar permisos seguros
- [X] T008 Actualizar `backend/.env.example` con `MQTT_PORT=8883` y `MQTT_CA_PATH=/run/secrets/ecotrack-ca.crt`, dejando placeholders para credenciales y sin incluir secretos reales
- [X] T009 Montar el CA público como archivo de solo lectura en el servicio backend de `docker-compose.yml` y verificar que la ruta de `MQTT_CA_PATH` coincida con el montaje

**Checkpoint**: El broker debe arrancar solo en `8883` con certificados válidos, sin modificar
`mosquitto/config/acl.conf` ni el modelo de usuarios MQTT.

## Phase 3: User Story 1 - Aislar publicaciones entre dispositivos (Priority: P1) 🎯 MVP

**Goal**: Comprobar mediante integración que un dispositivo solo puede publicar en su propio
tópico y que una publicación cruzada no llega al backend.

**Independent Test**: Con dos usuarios MQTT de prueba, A publica en su tópico y se observa una
ingesta válida; luego A publica en el tópico de B y, tras una ventana acotada, el backend no
recibe ni persiste el mensaje. La prueba no exige un error del publicador MQTT 3.1.1.

### Tests for User Story 1

- [X] T010 [US1] Crear la prueba de integración ACL en `backend/src/test/mqtt-acl.integration.test.js` usando dos usuarios MQTT de prueba, tópicos propios distintos y payloads únicos para distinguir publicación válida de publicación cruzada
- [X] T011 [US1] Añadir a `backend/src/test/mqtt-acl.integration.test.js` la espera/observación de ausencia del mensaje cruzado en la ingesta del backend, sin afirmar un error de `publish()`, y limpiar clientes/conexiones al finalizar

### Implementation for User Story 1

- [X] T012 [US1] Verificar en `mosquitto/config/acl.conf` que `backend` conserva lectura de `ecotrack/+/lecturas` y cada usuario de dispositivo conserva escritura únicamente en `ecotrack/<deviceId>/lecturas`, sin ampliar permisos
- [X] T013 [US1] Añadir en `backend/src/test/README-mqtt-acl.md` los prerrequisitos de los dos usuarios MQTT de prueba, el entorno TLS en `8883` y el criterio de ausencia observable en backend
- [X] T014 [US1] Ejecutar y ajustar `backend/src/test/mqtt-acl.integration.test.js` hasta demostrar publicación propia recibida y publicación cruzada ausente, manteniendo la suite backend existente en verde

**Checkpoint**: User Story 1 es demostrable independientemente y constituye el MVP.

## Phase 4: User Story 2 - Proteger el transporte MQTT (Priority: P1)

**Goal**: Hacer que backend y ESP32 validen la CA y el certificado SAN mediante TLS en
`8883`, sin fallback al listener `1883`.

**Independent Test**: Con la CA correcta ambos clientes conectan; con CA ausente/incorrecta,
certificado vencido o hostname fuera de SAN la conexión se rechaza y no se procesan lecturas.

### Tests for User Story 2

- [X] T015 [P] [US2] Añadir casos de conexión TLS del backend en `backend/src/test/mqtt-tls.integration.test.js` para CA válida, CA incorrecta/ausente y hostname que no coincide con SAN
- [X] T016 [P] [US2] Añadir una comprobación de configuración en `backend/src/test/mqtt-tls.integration.test.js` que falle si el broker expone `1883` o si el cliente intenta usar `mqtt://`/desactivar `rejectUnauthorized`

### Implementation for User Story 2

- [X] T017 [US2] Cambiar `backend/src/mqtt/client.js` a `mqtts://`, cargar el CA desde `process.env.MQTT_CA_PATH` con lectura explícita del archivo, mantener validación de hostname y exigir `rejectUnauthorized: true`
- [ ] T018 [US2] Cambiar `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino` a `WiFiClientSecure`, configurar el CA con `setCACert`, usar el puerto `8883` y eliminar cualquier ruta `setInsecure` o conexión MQTT sin TLS
- [ ] T019 [US2] Añadir sincronización NTP después de conexión WiFi y antes del primer handshake MQTT en `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino`; impedir la conexión si el reloj no alcanza una época válida
- [ ] T020 [US2] Añadir el CA público al firmware mediante `codigo-esp32-mosquitto/certs/ecotrack-ca.crt` y documentar su inclusión en `codigo-esp32-mosquitto/esp32Secret.h.example` sin versionar claves privadas
- [X] T021 [US2] Ejecutar los casos de confianza TLS de `backend/src/test/mqtt-tls.integration.test.js` y la validación del sketch/configuración, confirmando rechazo explícito sin degradación insegura

**Checkpoint**: Backend y ESP32 solo usan `8883`, validan CA/SAN y mantienen las credenciales
MQTT actuales.

## Phase 5: User Story 3 - Actualizar operación y documentación (Priority: P2)

**Goal**: Dejar una guía reproducible y diagramas coherentes con TLS, CA/SAN y NTP, retirando
TLS de pendientes.

**Independent Test**: Seguir el README desde un entorno limpio, generar certificados con los
comandos documentados, levantar Compose en `8883` y verificar que no hay instrucciones de MQTT
sin validación ni TLS pendiente.

### Implementation for User Story 3

- [X] T022 [P] [US3] Actualizar el diagrama de arquitectura en `README.MD` para mostrar `MQTTS/TLS:8883`, validación de CA/SAN y el flujo seguro entre ESP32, broker y backend
- [X] T023 [P] [US3] Actualizar las instrucciones de instalación, variables, volúmenes, SAN, comandos OpenSSL, NTP, CA del firmware y prueba ACL en `README.MD`
- [X] T024 [P] [US3] Eliminar la entrada `TLS para MQTT (puerto 8883)` de la sección de pendientes y actualizar el árbol de archivos TLS en `README.MD`
- [X] T025 [US3] Documentar en `README.MD` que `*.key`, `passwd` y credenciales locales no se versionan y que los clientes deben validar el CA
- [X] T026 [US3] Actualizar `docs/requisitos.md` únicamente si el diagrama/contrato operativo requiere reflejar TLS en `RI21`, `RI24` o los criterios de aceptación, sin alterar el modelo de ACL/credenciales

**Checkpoint**: La instalación documentada y el diagrama reflejan exactamente el canal TLS
exclusivo, la validación del CA y la sincronización NTP.

## Phase 6: Validación final del alcance

**Purpose**: Ejecutar solo las verificaciones requeridas por esta feature; no es una fase de
polish ni incluye refactors generales.

- [ ] T027 Ejecutar `npm test` desde `backend/` y confirmar que las pruebas existentes, ACL y TLS pasan juntas
- [ ] T028 Ejecutar los escenarios de [quickstart.md](./quickstart.md), incluyendo CA válida/incorrecta, SAN, puerto exclusivo `8883` y ACL cruzada
- [ ] T029 Revisar `git --no-pager diff --check` y confirmar que no se versionan archivos `*.key`, contraseñas MQTT ni material privado generado

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No depende de otras fases; T001-T004 pueden ejecutarse en paralelo.
- **Foundational (Phase 2)**: Depende de Setup; T005-T009 bloquean pruebas y clientes.
- **User Story 1 (Phase 3)**: Depende de Foundation; puede empezar cuando el broker TLS y
  usuarios de prueba estén disponibles.
- **User Story 2 (Phase 4)**: Depende de Foundation; puede desarrollarse en paralelo con US1,
  aunque su validación integral usa el broker TLS.
- **User Story 3 (Phase 5)**: Depende de US1 y US2 para documentar el estado final.
- **Validación final (Phase 6)**: Depende de las historias seleccionadas para el MVP.

### User Story Dependencies

- **US1 (P1)**: Foundation solamente; MVP principal.
- **US2 (P1)**: Foundation solamente; independiente de la lógica de ACL.
- **US3 (P2)**: Depende de US1 y US2 para que la documentación describa el comportamiento
  implementado.

### Parallel Opportunities

- T001-T004 son paralelas.
- T015-T016 son paralelas y preceden a T017-T021.
- T022-T023 pueden editarse en paralelo, pero T024-T025 deben integrar el contenido final.
- US1 y US2 pueden ejecutarse en paralelo después de Foundation si el entorno soporta trabajo
  concurrente.

## Parallel Example: User Story 1

```text
Task: T010 - Crear la prueba de integración ACL en backend/src/test/mqtt-acl.integration.test.js
Task: T013 - Documentar prerrequisitos y criterio de ausencia en backend/src/test/README-mqtt-acl.md
```

## Parallel Example: User Story 2

```text
Task: T015 - Añadir casos de CA/SAN en backend/src/test/mqtt-tls.integration.test.js
Task: T016 - Verificar que no existe fallback a 1883 o TLS inseguro
```

## Implementation Strategy

### MVP First (User Story 1)

1. Completar Setup y Foundation.
2. Implementar la prueba ACL con dos usuarios MQTT.
3. Verificar publicación propia y ausencia de publicación cruzada.
4. Continuar con US2 para completar el alcance de seguridad del canal.

### Incremental Delivery

1. Foundation deja el broker exclusivamente en `8883`.
2. US1 demuestra el aislamiento ACL observable.
3. US2 añade validación TLS en backend y ESP32.
4. US3 actualiza README y diagramas.
5. Phase 6 ejecuta la validación final mínima.
