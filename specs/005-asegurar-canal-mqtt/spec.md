# Feature Specification: Asegurar canal MQTT

**Feature Branch**: `005-asegurar-canal-mqtt`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Asegurar el canal MQTT entre dispositivos y backend. Alcance:
test de integración de ACL entre dispositivos, TLS en Mosquitto con certificados y validación
del CA por backend y ESP32, actualización de diagramas y README. No cambia el modelo actual de
ACL ni de credenciales."

## User Scenarios & Testing

### User Story 1 - Aislar publicaciones entre dispositivos (Priority: P1)

Como responsable de la plataforma, necesito comprobar que cada dispositivo solo pueda publicar
lecturas en su propio tópico, para evitar que un dispositivo suplante o contamine las lecturas
de otro.

**Why this priority**: La separación de dispositivos protege la integridad de los datos y es una
condición previa para confiar en la ingesta del backend.

**Independent Test**: Con dos dispositivos y sus credenciales existentes, publicar desde el
dispositivo A en el tópico del dispositivo B y comprobar que el backend no recibe ni persiste el
mensaje; publicar en el tópico propio y comprobar que la lectura sí se procesa.

**Acceptance Scenarios**:

1. **Given** dos credenciales de dispositivo válidas y una ACL que limita cada credencial a su
   propio tópico, **When** el dispositivo A publica una lectura en el tópico del dispositivo B,
   **Then** el broker descarta el mensaje y el backend no lo recibe ni crea una lectura.
2. **Given** un dispositivo con su credencial válida, **When** publica una lectura en
   `ecotrack/<su-deviceId>/lecturas`, **Then** el backend recibe, valida y procesa la lectura
   con el comportamiento actual.
3. **Given** el protocolo MQTT 3.1.1, **When** se rechaza la publicación cruzada, **Then** la
   prueba verifica la ausencia del mensaje en el backend, sin depender de un error explícito del
   broker al publicador.

---

### User Story 2 - Proteger el transporte entre dispositivos, broker y backend (Priority: P1)

Como operador, necesito que las lecturas viajen cifradas y que los clientes validen el
certificado de la autoridad certificadora esperada, para impedir conexiones a un broker
suplantado o interceptación del canal.

**Why this priority**: Las credenciales actuales solo son una barrera suficiente si también se
protege el canal que las transporta.

**Independent Test**: Levantar el broker con un certificado válido en el puerto seguro, conectar
el backend y un ESP32 con el CA correcto, y verificar que una conexión con CA ausente, incorrecto
o certificado inválido no pueda publicar ni suscribirse.

**Acceptance Scenarios**:

1. **Given** el broker configurado con certificados válidos, **When** el backend y un ESP32 se
   conectan usando el puerto TLS definido, **Then** ambos validan el CA y pueden mantener la
   publicación e ingesta normales.
2. **Given** un CA incorrecto, ausente o no confiable, **When** el backend o el ESP32 intenta
   conectarse, **Then** la conexión se rechaza y no se procesan lecturas como si el canal fuera
   seguro.
3. **Given** el puerto seguro habilitado, **When** se intenta usar el canal MQTT sin cifrado en
   ese flujo operativo, **Then** el servicio no lo presenta como una conexión válida para la
   ingesta protegida.

---

### User Story 3 - Operar y mantener la configuración documentada (Priority: P2)

Como desarrollador u operador, necesito que los diagramas y la guía de instalación describan el
canal TLS, los certificados, el CA y NTP, para poder desplegar y diagnosticar el sistema sin
instrucciones obsoletas.

**Why this priority**: La configuración segura debe ser reproducible y verificable por quienes
instalan el broker, el backend o el firmware.

**Independent Test**: Seguir el README desde un entorno limpio y comparar sus pasos, puertos y
diagramas con la configuración efectiva del broker, backend y firmware.

**Acceptance Scenarios**:

1. **Given** la documentación actualizada, **When** un operador configura el entorno, **Then**
   encuentra los certificados, el CA, el puerto seguro, SAN, NTP y las variables necesarias sin
   pasos contradictorios.
2. **Given** la arquitectura documentada, **When** se revisa el flujo dispositivo-broker-backend,
   **Then** se muestra el cifrado TLS y la validación del CA.
3. **Given** la funcionalidad TLS implementada, **When** se consulta la lista de pendientes del
   README, **Then** TLS MQTT ya no aparece como pendiente.

### Edge Cases

- El certificado del broker está vencido, no corresponde al nombre o no encadena con el CA
  configurado: la conexión debe fallar de forma explícita y no degradar silenciosamente a
  comunicación sin validación.
- El broker está disponible pero rechaza la ACL del tópico destino: el backend no debe recibir
  el mensaje y una publicación posterior válida debe seguir funcionando.
- El reloj del dispositivo no es suficiente para validar fechas del certificado: la inicialización
  debe impedir una conexión presentada como validada hasta contar con una referencia temporal
  válida.
- El CA configurado no existe o está vacío en backend o firmware: el arranque/configuración debe
  informar el error y no habilitar una conexión MQTT no validada.

## Requirements

### Functional Requirements

- **FR-001**: El broker MUST permitir a cada credencial de dispositivo publicar únicamente en el
  tópico asociado a su propio código, conservando el modelo actual de ACL y credenciales.
- **FR-002**: El sistema MUST incluir una prueba de integración con al menos dos dispositivos que
  verifique la ausencia del mensaje en el backend cuando uno publica en el tópico del otro.
- **FR-003**: La prueba de integración MUST verificar también que una publicación en el tópico
  propio continúa siendo recibida y procesada, para distinguir un rechazo de ACL de una caída
  general de ingesta.
- **FR-004**: Mosquitto MUST ofrecer el canal MQTT protegido mediante TLS en el puerto 8883,
  utilizando certificados configurados para el entorno.
- **FR-005**: El backend MUST validar la cadena de confianza del certificado del broker mediante
  el CA configurado y MUST rechazar conexiones que no puedan validarse.
- **FR-006**: El firmware del ESP32 MUST sincronizar la hora por NTP antes de validar el
  certificado y MUST validar el CA del broker antes de aceptar la conexión MQTT.
- **FR-007**: El sistema MUST conservar el tópico `ecotrack/<deviceId>/lecturas` y el payload
  JSON vigente, sin cambios incompatibles con el firmware desplegado.
- **FR-008**: La documentación MUST describir el puerto TLS, certificados, SAN, CA, configuración
  de backend y ESP32, NTP y la prueba de ACL.
- **FR-009**: Los diagramas de arquitectura MUST mostrar el canal cifrado entre ESP32, broker y
  backend y la validación del CA.
- **FR-010**: El README MUST eliminar TLS MQTT de la lista de pendientes y no MUST recomendar ni
  describir una ruta operativa que omita la validación del CA.

### Out of Scope

- El buffer de lecturas del ESP32, `pending_readings.h`, su prueba independiente con `g++`, el
  reenvío tras reconexión y la política de desborde se trasladan al spec 006.
- La incorporación del campo `ts` al payload y su tratamiento en backend se trasladan al spec 006.
- No se modifican el modelo de ACL, las credenciales existentes, el tópico ni el payload vigente
  dentro de este spec.

### Key Entities

- **Credencial de dispositivo**: identidad existente usada por un ESP32 para autenticarse ante el
  broker; no cambia su modelo ni su ciclo de aprovisionamiento.
- **Tópico de lectura**: dirección `ecotrack/<deviceId>/lecturas` asociada a un único dispositivo.
- **Certificado y CA del broker**: material de confianza que permite al backend y al ESP32
  autenticar el broker antes de intercambiar lecturas.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Una ejecución reproducible de la prueba de integración rechaza el 100% de las
  publicaciones cruzadas de los dispositivos probados y no registra ninguna como mensaje
  recibido por el backend.
- **SC-002**: En la misma ejecución, el 100% de las publicaciones válidas en el tópico propio
  dentro de la muestra de prueba llega al backend y conserva su dispositivo de origen.
- **SC-003**: El backend y el ESP32 establecen conexiones MQTT únicamente cuando la validación
  del CA es correcta; con un CA inválido, 0 lecturas se aceptan por una conexión no validada.
- **SC-004**: Una persona que siga el README puede identificar en menos de 10 minutos el puerto
  seguro, el CA requerido, SAN, NTP y la configuración de ambos clientes, sin encontrar TLS
  listado como pendiente.
- **SC-005**: Los diagramas y el README coinciden con la configuración efectiva en una revisión
  de aceptación, sin instrucciones que habiliten MQTT sin validación del CA.

## Assumptions

- Se reutilizan las credenciales y el modelo de ACL existentes; esta feature no introduce
  credenciales por cliente, nuevos permisos ni cambios de formato del tópico o payload.
- El entorno Docker Compose sigue siendo el entorno de integración reproducible para broker y
  backend; los certificados de desarrollo pueden ser locales y los secretos reales permanecen
  fuera del control de versiones.
- La sincronización NTP depende de que el dispositivo ya tenga conectividad WiFi; si falla, no
  se habilita una conexión MQTT presentada como validada.
- El contrato de ingesta existente, la validación del payload y la asociación backend-dispositivo
  permanecen sin cambios funcionales.
- Requisitos relacionados: RF03, RF04, RF05, RF12, RF18, RI16, RI21, RI22, RI24, RE03, RE05,
  RD02, RD07, y los criterios globales de pruebas, validación y aislamiento de
  [docs/requisitos.md](../../docs/requisitos.md).
