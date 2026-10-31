# Feature Specification: Endurecer aprovisionamiento WiFi

**Feature Branch**: `010-endurecer-provisionamiento-wifi`

**Created**: 2026-10-31

**Status**: Draft - Spec 1A scope revision

**Input**: User description: "Endurecer el aprovisionamiento WiFi del dispositivo EcoTrack: identidad de fábrica por dispositivo y portal de configuración temporal."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Identidad única de fábrica (Priority: P1)

El operario de fabricación prepara cada dispositivo con una identidad y credenciales propias, las registra para su operación posterior y evita que secretos de producción queden en el código o el repositorio.

**Why this priority**: Una clave compartida o un secreto incluido en el firmware permite acceder a varios dispositivos y contradice RNF06.

**Independent Test**: Preparar dos dispositivos reales con el procedimiento de fabricación, inspeccionar sus registros y verificar que cada uno tenga valores distintos y que el repositorio no contenga valores secretos de fábrica.

**Acceptance Scenarios**:

1. **Given** un dispositivo nuevo y un procedimiento de fabricación disponible, **When** el operario lo ejecuta, **Then** se generan un `device_id`, una clave SoftAP única y un secreto de dispositivo reservado para enrolamiento futuro.
2. **Given** dos dispositivos preparados por separado, **When** se comparan sus registros y se intenta acceder a sus SoftAP, **Then** sus claves son distintas y cada dispositivo acepta únicamente su propia clave.
3. **Given** el firmware y el repositorio del proyecto, **When** se buscan claves por defecto, secretos o credenciales de producción, **Then** no se encuentra ningún valor utilizable para acceder a un dispositivo.
4. **Given** los valores generados, **When** el operario termina la preparación, **Then** los tres valores quedan guardados en la memoria no volátil del dispositivo y registrados en una salida/etiqueta asociada al equipo.

---

### User Story 2 - Portal de configuración temporal y recuperable (Priority: P1)

El operario configura la conectividad inicial desde el SoftAP protegido del dispositivo. El portal deja de estar disponible al completar una configuración válida o al permanecer inactivo, y puede volver a abrirse mediante una acción física controlada.

**Why this priority**: Limitar la exposición del SoftAP reduce la superficie de ataque sin impedir la recuperación operativa de un equipo.

**Independent Test**: Probar en un dispositivo sin configuración, configurar una red válida, observar la transición a estación y repetir la prueba dejando el portal inactivo durante 10 minutos; luego abrirlo mediante el botón BOOT.

**Acceptance Scenarios**:

1. **Given** un dispositivo sin configuración WiFi válida, **When** arranca, **Then** abre un SoftAP abierto y ofrece el portal de configuración protegido inicialmente por un PIN de 6 dígitos.
2. **Given** un SoftAP activo, **When** se guarda una configuración WiFi válida y el dispositivo logra pasar a modo estación, **Then** el SoftAP se apaga y no permanece disponible.
3. **Given** un SoftAP activo sin guardar una configuración válida, **When** transcurren 10 minutos sin actividad de configuración, **Then** el SoftAP se apaga y no queda abierto indefinidamente.
4. **Given** un dispositivo con configuración guardada, **When** el operario mantiene presionado el botón BOOT durante 3 segundos, **Then** el dispositivo vuelve a abrir el portal temporal protegido por su clave única.
5. **Given** una configuración inválida o incompleta, **When** se intenta guardar, **Then** el dispositivo informa el error, conserva el portal activo y no cambia a modo estación.

---

### User Story 3 - Preparación de firmware para actualización futura (Priority: P2)

El equipo de firmware deja el almacenamiento preparado para dos versiones de aplicación y un sistema de archivos persistente, sin activar OTA, y puede informar cuánto espacio de flash utiliza la compilación.

**Why this priority**: Preparar el esquema ahora evita una migración de particiones durante la futura incorporación de OTA, manteniendo explícito el impacto operativo.

**Independent Test**: Reflashear un dispositivo por USB con el nuevo esquema, comprobar que arranca y conserva el flujo existente de conexión segura, y revisar el porcentaje de flash reportado por la compilación.

**Acceptance Scenarios**:

1. **Given** un firmware compilado con el esquema preparado, **When** se instala por USB en un dispositivo, **Then** el dispositivo arranca con dos slots de aplicación y LittleFS (Minimal SPIFFS), sin habilitar un proceso OTA.
2. **Given** una compilación del firmware, **When** se revisa su resultado, **Then** se informa el porcentaje de flash ocupado por el firmware y el espacio disponible relevante.
3. **Given** un dispositivo ya instalado con el nuevo firmware, **When** publica lecturas, **Then** continúa conectándose mediante TLS en el puerto 8883 y mantiene el formato actual de mensajes.
4. **Given** un dispositivo con el esquema anterior, **When** se aplica el nuevo esquema, **Then** la documentación advierte que es obligatorio reflashear por USB y que la operación puede requerir respaldar la configuración existente.

---

### Edge Cases

- Si el generador de identidad falla o produce un valor duplicado, el procedimiento debe detenerse sin escribir parcialmente el equipo y debe informar el error al operario.
- Si la memoria no volátil no puede guardar alguno de los valores, el dispositivo no debe presentarse como preparado ni iniciar un portal con credenciales incompletas.
- Si el usuario sigue realizando solicitudes de configuración antes de los 10 minutos, el temporizador de inactividad se reinicia; una solicitud inválida no cuenta como configuración válida.
- Si el dispositivo pierde la conexión durante el intento de configuración, el portal no debe reportar éxito ni apagar el SoftAP hasta que exista una configuración válida confirmada.
- Si el botón BOOT se mantiene presionado menos de 3 segundos, no debe abrir el portal en un dispositivo ya configurado.
- El cambio de particiones no debe activar OTA ni alterar los tópicos, credenciales de transporte o formato de mensajes vigentes.
- El SoftAP abierto y el formulario del portal no proporcionan cifrado; el PIN y la clave WiFi solo se consideran protegidos por el alcance físico, el bloqueo de intentos y el límite temporal.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El procedimiento de fabricación MUST generar por dispositivo un `device_id`, un PIN de instalación de seis dígitos y un secreto de dispositivo independiente; `softApPass` es opcional en Spec 1A.
- **FR-002**: El procedimiento MUST rechazar duplicados y MUST completar la preparación de forma atómica: un fallo no debe dejar un equipo marcado como preparado.
- **FR-003**: El dispositivo MUST guardar el `device_id`, la clave SoftAP y el secreto de dispositivo en memoria no volátil protegida contra lectura accidental.
- **FR-004**: El procedimiento MUST producir un registro o etiqueta asociada al dispositivo con el `device_id` y los datos necesarios para el operario, sin exponer secretos en el código fuente ni en archivos versionados.
- **FR-005**: La clave `softApPass` puede faltar en Spec 1A; cuando exista, no se debe usar como requisito del portal abierto.
- **FR-005A**: En Spec 1A el SoftAP MUST abrirse sin contraseña, pero el portal MUST exigir un PIN de seis dígitos antes de mostrar o aceptar la configuración WiFi.
- **FR-005B**: El portal MUST bloquearse después de cinco PINs incorrectos durante cinco minutos y MUST conservar un límite absoluto de diez minutos desde el arranque del portal.
- **FR-006**: El equipo sin configuración WiFi válida MUST abrir el portal al arrancar.
- **FR-007**: El equipo MUST apagar el SoftAP inmediatamente después de guardar y confirmar una configuración WiFi válida, y MUST continuar en modo estación.
- **FR-008**: El equipo MUST apagar el SoftAP después de 10 minutos de inactividad sin una configuración válida, sin dejarlo abierto indefinidamente.
- **FR-009**: El equipo configurado MUST permitir reabrir el portal únicamente mediante una pulsación sostenida del botón BOOT durante al menos 3 segundos, además de los casos de arranque sin configuración o recuperación ya definidos.
- **FR-010**: El portal MUST mostrar un resultado explícito de éxito o error y no debe apagar el SoftAP ante una configuración inválida o incompleta.
- **FR-011**: El firmware MUST usar un esquema de memoria con dos slots de aplicación y LittleFS (Minimal SPIFFS), sin implementar OTA en esta funcionalidad.
- **FR-012**: El proceso de compilación o instalación MUST informar el porcentaje de flash utilizado por el firmware.
- **FR-013**: La documentación MUST advertir que el cambio de esquema exige reflashear por USB y describir el impacto esperado sobre la configuración local.
- **FR-014**: El dispositivo MUST conservar la conexión TLS por el puerto 8883 y el formato actual de mensajes MQTT.
- **FR-015**: La funcionalidad MUST mantener fuera de alcance el enrolamiento automático, el buffer previo a NTP, la persistencia del buffer, OTA y los cambios de backend.

### Key Entities

- **Identidad de fábrica**: Conjunto por dispositivo formado por `device_id`, PIN de instalación, `serverHost`, clave SoftAP opcional y secreto reservado para una futura especificación de enrolamiento.
- **Registro de fabricación**: Salida o etiqueta que vincula la identidad pública operativa con el equipo físico y permite al operario completar su trazabilidad.
- **Sesión del portal**: Periodo temporal durante el cual el SoftAP y la configuración local están disponibles, con estado activo, configurado o expirado.
- **Configuración WiFi válida**: Credenciales y parámetros mínimos aceptados por el dispositivo y confirmados mediante una conexión en modo estación.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En una muestra de al menos 20 dispositivos preparados, el 100% tiene un `device_id`, una clave SoftAP y un secreto registrados, y no hay dos claves SoftAP iguales.
- **SC-002**: Una búsqueda automatizada del código fuente y archivos versionados no encuentra claves SoftAP por defecto, secretos de dispositivo ni credenciales de producción utilizables.
- **SC-003**: En pruebas con dispositivos reales, el 100% apaga el SoftAP después de confirmar una configuración válida y el 100% lo apaga al cumplirse 10 minutos de inactividad, con una tolerancia máxima de 30 segundos.
- **SC-004**: Al menos el 95% de los operarios puede completar la configuración inicial en menos de 5 minutos siguiendo únicamente el procedimiento y las indicaciones del portal.
- **SC-005**: El 100% de las pruebas de regresión de conectividad mantiene una conexión TLS exitosa por 8883 y conserva el formato vigente de los mensajes.
- **SC-006**: Cada compilación distribuible informa el porcentaje de flash ocupado, y el cambio de esquema se completa mediante un reflasheo USB documentado en el 100% de las instalaciones de prueba.

## Assumptions

- El secreto de dispositivo se reserva y almacena para la futura especificación de enrolamiento; esta funcionalidad no lo usa para enrolar ni cambia el backend.
- La generación se ejecuta en un entorno de fabricación controlado y el operario puede asociar físicamente cada salida al dispositivo correcto.
- Los tres valores de fábrica se consideran material sensible; el registro operativo debe aplicar los controles físicos y de acceso definidos por fabricación.
- Los 10 minutos reemplazan el límite operativo anterior de 5 minutos para este portal, alineando la implementación con esta especificación y RI13.
- La configuración WiFi existente se considera respaldable o recreable al reflashear; no se promete conservarla al cambiar el esquema de particiones.
- La conexión TLS 8883, los tópicos y el formato de mensajes actuales son contratos existentes que no se modifican.
- En Spec 1A, `mqttHost`, `mqttUser` y `mqttPass` solo aparecen en compilaciones con `ECOTRACK_DEV_PORTAL`; esa macro queda desactivada por defecto.
- Esta especificación implementa RF03, RF15, RNF02, RNF06, RNF08, RI13, RI16 y RD06 de [docs/requisitos.md](../../docs/requisitos.md).
