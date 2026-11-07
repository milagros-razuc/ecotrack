# Feature Specification: Proteger portal SoftAP con WPA2

**Feature Branch**: `019-cerrar-softap-eliminar-pin`

**Created**: 2026-11-07

**Status**: Implemented; acceptance pending

**Input**: User decision: usar el código compartido `EcoTrack.123` en el SoftAP y quitar el PIN del portal.

## User Scenarios & Testing

### User Story 1 - Conectar al portal protegido (Priority: P1)

El instalador conecta el teléfono o computadora al SoftAP EcoTrack usando el código compartido de provisión y accede directamente al formulario WiFi, sin ingresar un PIN adicional.

**Why this priority**: El dispositivo requiere una passphrase para cifrar el enlace y limitar asociaciones casuales. El equipo acepta que el código sea conocido y compartido por todos los dispositivos.

**Independent Test**: En un ESP32, comprobar que `EcoTrack.123` permite asociarse, una clave incorrecta no, y al abrir el portal aparece directamente el formulario sin solicitud de PIN.

**Acceptance Scenarios**:

1. **Given** un dispositivo que inicia el portal de provisión, **When** anuncia el SoftAP, **Then** solicita la clave WPA2 compartida `EcoTrack.123`.
2. **Given** un instalador con el código compartido, **When** se conecta y abre el portal, **Then** ve directamente el formulario de red WiFi sin introducir un PIN.
3. **Given** un instalador que ingresa otra clave, **When** intenta conectarse, **Then** no puede asociarse al SoftAP.
4. **Given** credenciales WiFi válidas y una conexión EcoTrack confirmada, **When** concluye el alta, **Then** el firmware conserva el comportamiento vigente de guardar la configuración y apagar el SoftAP.

### Edge Cases

- Toda persona que conozca el código compartido, incluido quien lo obtenga del repositorio o documentación, puede asociarse al SoftAP y acceder al formulario mientras esté activo.
- WPA2 cifra el enlace de radio, pero el formulario permanece en HTTP; las credenciales que el ESP32 recibe no tienen TLS hasta el navegador.
- El timeout, el cierre tras configuración correcta, la recuperación por BOOT y el flujo MQTT/TLS deben conservarse.
- El NVS existente puede conservar un `softApPass` antiguo; el nuevo firmware lo ignora y utiliza el código compartido.

## Requirements

### Functional Requirements

- **FR-001**: El firmware MUST iniciar el SoftAP temporal con WPA2 usando el código compartido `EcoTrack.123`.
- **FR-002**: El portal MUST mostrar directamente la configuración WiFi al ingresar al AP; MUST eliminar la pantalla PIN, la ruta `/unlock`, su comparación y el bloqueo por intentos.
- **FR-003**: La identidad de fábrica MUST seguir validando los campos que necesita el dispositivo, pero no debe requerir ni leer una contraseña SoftAP desde NVS.
- **FR-004**: El procedimiento de fabricación MUST dejar de generar, almacenar, exportar o rotular el PIN y la contraseña SoftAP; la etiqueta solo debe contener `device_id`.
- **FR-005**: La configuración WiFi, la confirmación de conectividad, el cierre del SoftAP, su timeout y el acceso de recuperación por BOOT MUST conservarse.
- **FR-006**: El canal MQTT/TLS, la identidad de dispositivo, el payload y los contratos de enrolamiento MUST permanecer sin cambios.
- **FR-007**: La documentación MUST identificar `EcoTrack.123` como código público, compartido y no secreto, y describir que cualquiera que lo conozca puede asociarse mientras el portal esté activo.

### Key Entities

- **Identidad de fábrica**: `device_id`, `serverHost` y secreto de dispositivo. No contiene PIN ni contraseña SoftAP.
- **Código público del SoftAP**: valor estático compartido que habilita la asociación WPA2, sin pretensión de ser secreto ni identificador individual.
- **Portal temporal**: SoftAP WPA2 más formulario HTTP disponible durante la provisión o recuperación.

## Success Criteria

### Measurable Outcomes

- **SC-001**: `EcoTrack.123` permite asociarse al SoftAP en el 100% de dispositivos evaluados; una clave incorrecta no permite asociación.
- **SC-002**: El 100% de accesos correctos llega al formulario WiFi sin pantalla ni paso de PIN.
- **SC-003**: El firmware y el procedimiento de fabricación no leen, generan, almacenan ni rotulan un `softApPass` o PIN.
- **SC-004**: El 100% de las pruebas de conectividad, cierre y recuperación conservan el comportamiento vigente.

## Assumptions

- El usuario acepta que `EcoTrack.123` sea una clave conocida públicamente y común a todos los dispositivos; su exposición no se considera una filtración de secreto, pero sí permite el acceso al SoftAP.
- No se requiere mantener credencial WiFi por dispositivo ni el atributo `softApPass` en el NVS.
- El portal continúa en HTTP. Esta feature no añade HTTPS, autenticación posterior ni controles contra usuarios que conozcan la clave.
- Esta feature sustituye el flujo anterior abierto + PIN y la decisión intermedia de claves individuales; mantiene RF15, RI13, RD06 y actualiza RNF06 con una excepción explícita.

## Requirements Traceability

- Implementa/modifica: RF15, RI13, RD06 y RNF06 de `docs/requisitos.md`.
- Actualiza el comportamiento de provisión previamente descrito en `specs/010-endurecer-provisionamiento-wifi/`.
- Decisión aceptada por el usuario: clave compartida `EcoTrack.123`, sin PIN y sin secreto SoftAP individual.
