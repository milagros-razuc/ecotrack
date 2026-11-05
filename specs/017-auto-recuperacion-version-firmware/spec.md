# Feature Specification: Auto-recuperación y versión de firmware

**Feature Branch**: `017-auto-recuperacion-version-firmware`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Crear una versión de firmware que borre credenciales MQTT después de N rechazos consecutivos de autenticación y vuelva a enrolar, distinguiendo cortes de red; reportar una constante de versión al backend con persistencia de versión y fecha del último reporte."

## User Scenarios & Testing

### User Story 1 - Recuperar credenciales MQTT invalidadas (Priority: P1)

Como operador, quiero que un dispositivo pueda recuperarse automáticamente cuando sus
credenciales MQTT fueron rechazadas, sin borrar credenciales válidas durante una caída
del broker o de la red.

**Why this priority**: Permite recuperar dispositivos afectados por un reset de
credenciales sin reflashear manualmente el NVS.

**Independent Test**: Simular N rechazos consecutivos de autenticación y verificar que
solo entonces se invalidan las credenciales operativas, se conserva la identidad de
fábrica y se inicia un nuevo enrolamiento HTTPS. Simular cortes de red, timeout,
DNS/TLS fallido y broker no disponible para verificar que no se borran credenciales.

**Acceptance Scenarios**:

1. **Given** un dispositivo con credenciales MQTT persistidas, **When** recibe el
   primer hasta N-1 rechazos inequívocos de autenticación consecutivos, separados por
   al menos 30 segundos y recibidos como CONNACK de autenticación rechazada, **Then**
   no borra credenciales y conserva el contador persistente o de sesión definido.
2. **Given** N rechazos consecutivos de autenticación, **When** ocurre el rechazo N,
   **Then** borra únicamente `mqtt_user` y `mqtt_pass` y marca el estado operativo
   MQTT como no enrolado, sin borrar otros datos de NVS.
3. **Given** broker caído, Wi-Fi ausente, timeout, DNS fallido o error TLS de
   conectividad, **When** el dispositivo no puede establecer la conexión, **Then**
   no clasifica el evento como rechazo de credenciales ni borra NVS.
4. **Given** credenciales borradas por el umbral, **When** el dispositivo recupera
   Wi-Fi y conectividad HTTPS, **Then** vuelve a enrolarse con el `device_secret`
   existente, sin pedir un token de reclamo nuevo.
5. **Given** que el re-enrolamiento falla, **When** el dispositivo reintenta, **Then**
   conserva identidad de fábrica, secreto de fábrica y Wi-Fi, y aplica backoff sin
   imprimir ni exponer secretos; no realiza más de 3 re-enrolamientos por hora.

### User Story 2 - Identificar la versión desplegada (Priority: P1)

Como administrador del cliente, quiero consultar la versión de firmware reportada por
cada dispositivo y cuándo fue reportada por última vez, para detectar dispositivos
desactualizados y planificar el OTA de diciembre.

**Why this priority**: Permite verificar qué dispositivos recibieron el firmware de
recuperación y controlar la transición de versiones sin exponer credenciales.

**Independent Test**: Reportar una versión desde un dispositivo autenticado, verificar
que el backend valida el origen y guarda versión y fecha; enviar un reporte no
autenticado o malformado y verificar que no modifica esos datos.

**Acceptance Scenarios**:

1. **Given** un dispositivo autenticado por su canal operativo, **When** reporta la
   constante de versión, **Then** el backend actualiza `firmware_version` y la fecha
   del último reporte asociadas al dispositivo correcto, únicamente si la identidad
   autenticada es la dueña de ese `device_id`.
2. **Given** un mensaje de lectura válido sin reporte de versión, **When** llega al
   backend, **Then** la lectura sigue siendo compatible y no se inventa ni sobrescribe
   una versión.
3. **Given** un intento de reportar versión usando un body HTTP público o una
   identidad MQTT no válida, **When** llega al backend, **Then** se rechaza sin
   actualizar versión, fecha ni otro dispositivo.
4. **Given** una versión inválida, vacía, excesivamente larga o con formato no
   permitido, **When** se recibe, **Then** se rechaza antes de persistirla.
5. **Given** el listado de dispositivos del cliente, **When** un administrador lo
   consulta, **Then** ve versión y fecha del último reporte, pero nunca secretos,
   tokens, contraseñas ni hashes sensibles.

### Edge Cases

- Los rechazos de autenticación llegan intercalados con éxitos: el contador
  consecutivo se reinicia y no se alcanza el umbral por eventos no consecutivos.
- El broker responde un código que no permite distinguir autenticación de conectividad:
  el dispositivo debe tratarlo como no concluyente y no borrar credenciales.
- El dispositivo reinicia antes de alcanzar N rechazos: el comportamiento del contador
  debe ser determinista y estar cubierto por tests.
- El enrolamiento posterior devuelve error, timeout o respuesta inválida.
- El reporte de versión llega repetido: debe ser idempotente y actualizar solo la fecha
  según la política definida.
- El dispositivo está fabricado pero nunca reclamado, reclamado pero nunca enrolado,
  reseteado y pendiente de enrolamiento, o dado de baja.
- Un usuario intenta consultar o alterar datos de un dispositivo de otro cliente.
- El firmware antiguo no reporta versión: el backend debe mostrar ausencia de reporte,
  como **"desconocida"**, sin errores ni modificación de otros datos.
- El OTA deja dispositivos en versiones mixtas durante el despliegue de diciembre.
- Dos rechazos de autenticación ocurren con menos de 30 segundos entre sí: el segundo
  no incrementa el contador de recuperación.
- Un CONNACK de autenticación rechazada llega después de un timeout, DNS, TLS o Wi-Fi
  caído: no cuenta como una secuencia válida hasta que se obtengan nuevos CONNACK
  inequívocos con el intervalo mínimo.
- Se alcanza el límite horario de re-enrolamientos: el dispositivo conserva la
  identidad de fábrica y espera la siguiente ventana sin generar un bucle.
- Un dispositivo autenticado intenta reportar la versión de otro `device_id`: el
  backend rechaza el reporte y no actualiza ningún dispositivo.
- El reset de credenciales de la spec 016 ocurre mientras el equipo está operativo:
  el equipo actualizado debe detectar los rechazos, recuperarse y completar el
  re-enrolamiento sin un token de reclamo nuevo.

## Requirements

### Functional Requirements

- **FR-001**: El firmware MUST usar un umbral fijo de **3 rechazos inequívocos de
  autenticación MQTT consecutivos** para activar la recuperación automática.
- **FR-002**: El firmware MUST reiniciar el contador ante una conexión MQTT exitosa y
  MUST reiniciarlo o invalidarlo ante cualquier evento no concluyente que no sea un
  rechazo de autenticación confirmado.
- **FR-003**: El firmware MUST distinguir rechazo de credenciales de Wi-Fi ausente,
  broker caído, timeout, DNS fallido y fallo de negociación TLS; estos últimos MUST
  no borrar credenciales.
- **FR-004**: Solo deben contar como rechazos para el umbral los CONNACK MQTT que
  indiquen inequívocamente rechazo de autenticación. Timeouts, DNS, TLS, broker
  caído, Wi-Fi caído y códigos no concluyentes no cuentan.
- **FR-005**: Entre dos rechazos contables debe transcurrir un mínimo de **30
  segundos**; los eventos anteriores al intervalo mínimo no incrementan el contador.
- **FR-006**: Al alcanzar el umbral, el firmware MUST borrar únicamente `mqtt_user`
  y `mqtt_pass` del NVS y establecer el estado operativo MQTT como no enrolado.
  MUST conservar `device_id`, `device_secret`, identidad de fábrica, PIN, SSID,
  contraseña Wi-Fi, servidor de enrolamiento y certificados CA. No debe borrar,
  modificar ni regenerar esos datos conservados.
- **FR-007**: Después de la invalidación, el firmware MUST volver a enrolarse mediante
  el contrato HTTPS existente usando el mismo secreto de fábrica y sin generar token
  de reclamo nuevo.
- **FR-008**: Después de una invalidación, el firmware MUST limitar los intentos de
  re-enrolamiento a **3 por hora**, con backoff de 90, 180 y 360 segundos entre
  intentos; al alcanzar el límite debe esperar la siguiente ventana horaria.
- **FR-009**: El firmware MUST aplicar el límite y backoff sin imprimir credenciales,
  secretos, tokens ni contraseñas.
- **FR-010**: El firmware MUST declarar una constante de versión única, no vacía y
  validable, incluida en cada binario distribuido.
- **FR-011**: El reporte de versión MUST viajar por un mecanismo autenticado y asociado
  a la identidad del dispositivo; no se aceptará un campo de body HTTP público como
  fuente confiable de identidad o autorización.
- **FR-012**: El backend MUST aceptar el reporte únicamente cuando la identidad
  autenticada corresponde al dueño del `device_id` reportado; un dispositivo no
  puede reportar ni modificar la versión de otro dispositivo o cliente.
- **FR-013**: El backend MUST persistir `firmware_version` y la fecha del último
  reporte para cada dispositivo, sin almacenar secretos nuevos.
- **FR-014**: El backend MUST validar versión, identidad del dispositivo, cliente
  asociado y formato antes de actualizar la persistencia.
- **FR-015**: El listado administrativo MUST mostrar versión, fecha de último reporte
  y estados fabricado, reclamado, enrolado y online/offline, con aislamiento por
  `cliente_id`.
- **FR-016**: Cuando no exista reporte de versión, el listado MUST mostrar exactamente
  **"desconocida"**, sin generar error ni alterar `firmware_version` o su fecha.
- **FR-017**: El backend MUST ocultar tokens de reclamo, secretos de fábrica,
  contraseñas MQTT, credenciales Dynamic Security, hashes y cualquier secreto en
  respuestas, logs y errores.
- **FR-018**: El contrato de lecturas MQTT existente MUST seguir siendo compatible
  con firmware que no reporta versión; el reporte no debe ser obligatorio para
  procesar lecturas.
- **FR-019**: La migración MUST conservar el NVS en `0x9000` con tamaño `0x5000`,
  no modificar `partitions.csv` ni cambiar el esquema de partición.
- **FR-020**: La comunicación TLS MUST conservar validación de certificado; queda
  prohibido usar `setInsecure`, desactivar `rejectUnauthorized` o introducir
  excepciones equivalentes.
- **FR-021**: La implementación MUST mantener sin cambios el contrato de reclamo y
  enrolamiento, salvo los ajustes estrictamente necesarios para que el firmware
  vuelva a invocar el endpoint de enrolamiento existente después de invalidar sus
  credenciales MQTT. No se deben cambiar tokens, autorización, criterios de reclamo
  ni los tests existentes de esos flujos.
- **FR-022**: Los tests MUST cubrir el umbral exacto de 3 CONNACK rechazados, el
  intervalo mínimo de 30 segundos, el reinicio del contador, la no eliminación ante
  fallos de conectividad, la lista exacta de datos borrados/conservados, el límite de
  3 re-enrolamientos por hora, el backoff y el re-enrolamiento sin token nuevo.
- **FR-023**: Los tests del reporte MUST cubrir autenticación, autorización del dueño
  del `device_id`, aislamiento entre clientes, validación de versión, persistencia de
  fecha, valor "desconocida" y compatibilidad con firmware que no reporta.
- **FR-024**: Debe existir una prueba extremo a extremo que ejecute el reset de
  credenciales de la spec 016, provoque los rechazos MQTT correspondientes en un
  dispositivo con el firmware nuevo y compruebe que el equipo borra solo las
  credenciales operativas, vuelve a enrolarse mediante HTTPS sin token nuevo y queda
  operativo con nuevas credenciales.
- **FR-025**: El despliegue OTA de diciembre MUST poder identificar binarios por
  versión, mantener compatibilidad con dispositivos antiguos y permitir rollout
  gradual con observación de versiones reportadas y rollback del binario sin cambiar
  particiones.

### Impacto en el OTA de diciembre

- El binario de diciembre debe publicarse con una versión inequívoca y conservar el
  layout actual: NVS en `0x9000`, tamaño `0x5000`, sin modificar `partitions.csv`.
- El despliegue debe ser gradual, manteniendo el binario anterior como rollback y
  midiendo reportes de versión antes de avanzar de lote.
- Los dispositivos antiguos seguirán operativos aunque no reporten versión; el panel
  debe distinguir “sin reporte” de una versión conocida.
- La recuperación automática solo estará disponible después de instalar el binario
  nuevo; antes de eso, un reset de credenciales puede seguir requiriendo intervención
  manual sobre NVS.
- La validación TLS y los certificados deben permanecer activos durante OTA,
  enrolamiento, reporte y recuperación.

### Key Entities

- **Versión de firmware**: identificador constante del binario desplegado.
- **Reporte de firmware**: evento autenticado de un dispositivo que contiene su versión
  y momento de recepción.
- **Dispositivo**: unidad fabricada, reclamada, enrolada y conectada, vinculada a un
  cliente.
- **Credenciales operativas MQTT**: usuario, contraseña, host y marca de enrolamiento
  persistidos en NVS; no incluyen la identidad ni el secreto de fábrica.

## Success Criteria

### Measurable Outcomes

- **SC-001**: El 100% de los dispositivos con exactamente tres rechazos de
  autenticación consecutivos activa la recuperación, y el 100% con menos de tres no
  borra credenciales.
- **SC-002**: El 100% de los eventos clasificados como Wi-Fi ausente, broker caído,
  timeout, DNS o TLS fallido conserva las credenciales MQTT válidas.
- **SC-003**: Al menos el 95% de los dispositivos recuperables completa el nuevo
  enrolamiento dentro de 3 ciclos de backoff cuando el broker y backend están
  disponibles.
- **SC-004**: El 100% de los reportes autenticados válidos persiste versión y fecha
  en el dispositivo correcto; el 100% de reportes no autenticados o inválidos no
  modifica datos.
- **SC-005**: El 100% de las respuestas administrativas omite secretos, tokens,
  contraseñas y hashes sensibles.
- **SC-006**: Durante el OTA de diciembre, el despliegue puede avanzar por etapas y
  mostrar qué dispositivos siguen sin reportar versión nueva, sin cambiar el esquema
  de partición.

## Assumptions

- El umbral inicial de tres rechazos es suficiente para evitar borrar credenciales
  durante fallos transitorios; podrá cambiarse en una futura spec si la evidencia de
  campo lo requiere.
- El broker permite distinguir de forma confiable un rechazo de autenticación de un
  fallo de transporte o conectividad.
- El endpoint de enrolamiento existente continúa aceptando el mismo `device_secret`
  para un dispositivo reclamado con `enrolled_at` nulo.
- El reporte autenticado reutilizará la sesión MQTT operativa o un mecanismo equivalente
  ya autenticado; no se abrirá un canal HTTP anónimo de confianza.
- Los dispositivos con firmware anterior no reportarán versión y aparecerán como
  “sin reporte”.
- El OTA de diciembre se realizará de forma gradual, conservando el binario anterior
  como rollback y sin cambios de particiones.

## Traceability

Esta spec implementa o amplía: RF03, RF04, RF05, RF12, RF14, RF15, RF17, RF18, RF21,
RF22, RF23, RNF05, RNF16, RNF18, RNF20, RI13, RI16, RI19, RI21, RI22 y RI24 de
[docs/requisitos.md](../../docs/requisitos.md). No modifica el contrato de reclamo ni
los criterios de enrolamiento existentes; solo habilita una nueva invocación del
endpoint de enrolamiento después de una invalidación local segura.
