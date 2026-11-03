# Feature Specification: Enrolamiento seguro de dispositivo

**Feature Branch**: `014-enrolar-dispositivo`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Endpoint POST /api/dispositivos/enrolar por HTTPS. El firmware envía únicamente device_id y secreto de fábrica. El código de alta y el token de un solo uso los ingresa previamente el cliente en el dashboard, cuyo reclamo vincula device_id con cliente_id. El backend valida contra el hash del secreto (nunca guardar el secreto en claro), crea usuario y rol con ACL en Mosquitto vía dynamic-security y devuelve las credenciales UNA sola vez. Requisitos: mismo error genérico en todos los rechazos, rate limit, aislamiento por cliente_id, comparación en tiempo constante, sin secretos en logs. Si falla dynamic-security, rollback: no deja el dispositivo a medias ni credenciales huérfanas. Tests unitarios con el doble de MQTT y dos clientes (A y B). HTTPS termina en nginx con certificado firmado por la misma CA embebida en el firmware y SAN igual a serverHost."

**Requisitos relacionados**: RF03, RF04, RF12, RF18, RF19, RF21, RI06, RI14, RI15, RNF02, RNF03, RNF05, RNF06, RNF15, RNF16, RNF17, RNF20, RNF21.

## User Scenarios & Testing

### User Story 1 - Enrolar un dispositivo desde el dashboard (Priority: P1)

Como administrador de un cliente, necesito reclamar previamente el dispositivo con
el código de alta y el token de un solo uso en el dashboard, para vincularlo a mi
cliente antes de que el firmware solicite sus credenciales MQTT con `device_id` y
secreto de fábrica.

**Why this priority**: El flujo permite convertir un dispositivo preparado en una
identidad operativa sin exponer secretos de fábrica ni habilitar acceso entre clientes.

**Independent Test**: Con un dispositivo de prueba sin dueño y un usuario
administrador del cliente A, ejecutar el endpoint por HTTPS y comprobar la
vinculación, la creación de la identidad MQTT y la entrega única de credenciales.

**Acceptance Scenarios**:

1. **Given** un dispositivo reclamado por el cliente A mediante el flujo existente
   de código de alta y token de un solo uso, **When** el firmware envía únicamente
   `device_id` y `device_secret` correctos por HTTPS, **Then** recibe una identidad
   MQTT limitada a su topic.
2. **Given** una respuesta exitosa de enrolamiento, **When** el administrador vuelve
   a consultar el endpoint o solicita nuevamente las credenciales, **Then** la
   operación no devuelve el secreto MQTT ni permite reutilizar el token.
3. **Given** un dispositivo ya vinculado al cliente A, **When** un usuario del
   cliente B intenta enrolarlo usando el mismo código o token, **Then** se rechaza
   con el mismo error genérico y el dispositivo conserva su vínculo con A.

### User Story 2 - Rechazar intentos inválidos sin revelar información (Priority: P1)

Como responsable de seguridad, necesito que los rechazos de enrolamiento sean
indistinguibles y estén limitados, para evitar enumeración de dispositivos,
clientes, tokens o secretos.

**Why this priority**: Diferenciar si falló el código, token, secreto, estado o
cliente permitiría descubrir identidades y facilitar ataques de fuerza bruta.

**Independent Test**: Ejecutar intentos con cada combinación inválida y comparar
status, cuerpo, mensaje y comportamiento de rate limit, además de inspeccionar logs
sanitizados.

**Acceptance Scenarios**:

1. **Given** un código, token, secreto o vínculo inválido, **When** se solicita el
   enrolamiento, **Then** todos los rechazos exponen el mismo status y mensaje
   genérico, sin indicar cuál validación falló.
2. **Given** múltiples intentos desde una misma identidad o dirección, **When** se
   supera el límite configurado, **Then** nuevas solicitudes son rechazadas durante
   la ventana correspondiente sin procesar secretos.
3. **Given** cualquier solicitud aceptada o rechazada, **When** se revisan los logs,
   **Then** no aparecen secretos de fábrica, credenciales MQTT, tokens completos ni
   valores equivalentes que permitan reconstruirlos.

### User Story 3 - Mantener consistencia ante fallos de Mosquitto (Priority: P1)

Como operador, necesito que un fallo al crear la identidad MQTT deshaga el
enrolamiento local, para no dejar dispositivos a medias ni credenciales huérfanas.

**Why this priority**: El vínculo local y la ACL del broker deben representar el
 mismo estado operativo; una operación parcial puede bloquear la recuperación o
 ampliar permisos accidentalmente.

**Independent Test**: Simular respuestas de error, timeout y desconexión del
 servicio MQTT con un doble, y verificar que no quedan vínculo persistente,
 token consumido indebidamente ni cliente/rol huérfano según el contrato de rollback.

**Acceptance Scenarios**:

1. **Given** que las validaciones locales pasan, **When** dynamic-security falla
   antes de completar la identidad, **Then** la operación informa el error genérico,
   no vincula el dispositivo y no deja credenciales o roles huérfanos.
2. **Given** que la identidad MQTT se crea pero falla la persistencia del vínculo
   local, **When** se ejecuta el rollback, **Then** se elimina o revoca la identidad
   creada y el dispositivo queda disponible para un intento válido posterior.
3. **Given** un rollback incompleto o no confirmable, **When** finaliza la solicitud,
   **Then** el dispositivo no se presenta como enrolado, se registra un log
   sanitizado en stderr para resolución manual y la operación no se aprueba.

### User Story 4 - Aislar clientes A y B (Priority: P1)

Como administrador del cliente A, necesito que el dispositivo enrolado y sus
lecturas permanezcan aislados de B, incluso si B conoce identificadores públicos.

**Why this priority**: El endpoint combina autorización de dashboard, vínculo de
dispositivo y ACL MQTT; cualquier cruce rompe RNF05, RNF16 y RNF20.

**Independent Test**: Ejecutar el mismo conjunto de pruebas con usuarios y
dispositivos de A y B: alta válida, alta cruzada, publicación propia y publicación
o suscripción cruzada.

**Acceptance Scenarios**:

1. **Given** un dispositivo enrolado por A, **When** su identidad MQTT publica en su
   propio topic, **Then** la publicación es aceptada y queda asociada al dispositivo
   y cliente correctos.
2. **Given** identidades MQTT de A y B, **When** A intenta publicar o suscribirse a
   topics de B, **Then** ambas operaciones son rechazadas por la ACL.
3. **Given** un usuario autenticado de B, **When** intenta enrolar un dispositivo o
   consultar el resultado de A, **Then** no obtiene información sobre la existencia,
   estado, token o secreto de A.

## Edge Cases

- El token ya fue usado, expiró, fue revocado o pertenece a otro dispositivo.
- El secreto de fábrica es correcto pero el dispositivo ya tiene dueño.
- El código de alta es válido para otro cliente o no coincide con el token.
- El secreto se recibe vacío, con formato inválido o con longitud extrema.
- Se reciben solicitudes concurrentes para el mismo dispositivo desde A y B; solo
  una puede vincularlo.
- Dynamic-security devuelve éxito parcial, respuesta duplicada, timeout o error de
  autorización.
- El rollback del broker falla después de persistir el vínculo local, o el rollback
  local falla después de crear la identidad MQTT.
- Se repite la solicitud después de una respuesta de red perdida; no se deben emitir
  credenciales nuevas ni consumir nuevamente el token.
- El rate limit se alcanza desde varias direcciones o sesiones para el mismo usuario.
- Un secreto, token o credencial aparece en una excepción de una dependencia; debe
  sanitizarse antes de registrar el error.
- La solicitud no usa HTTPS, excede el límite o no contiene credenciales de
  firmware válidas.

## Requirements

### Functional Requirements

- **FR-001**: El sistema MUST exponer `POST /api/dispositivos/enrolar` únicamente
  sobre HTTPS. El firmware se autentica con `device_id` y el secreto de fábrica;
  la autorización administrativa ocurre antes, durante el reclamo del dashboard,
  y no se exige una sesión JWT en esta llamada.
- **FR-002**: La entrada del endpoint MUST aceptar únicamente `device_id` y
  `device_secret`, con validación de formato, presencia y tamaño antes de cualquier
  operación externa. El código de alta y el token no forman parte del body: se
  validan en el reclamo previo del dashboard y su resultado debe haber vinculado el
  dispositivo al `cliente_id`.
- **FR-003**: El sistema MUST almacenar únicamente un hash del secreto de fábrica
  y MUST comparar el secreto recibido en tiempo constante; el secreto en claro no
  puede persistirse, devolverse ni registrarse.
- **FR-004**: El flujo existente de reclamo MUST validar el código de alta y el
  token contra el cliente de la sesión y el dispositivo solicitado; el token MUST
  consumirse de forma atómica y no reutilizable al completar el reclamo. El endpoint
  de enrolamiento solo continúa si ese reclamo ya vinculó el dispositivo al
  `cliente_id`.
- **FR-005**: El vínculo MUST usar el `cliente_id` de la sesión autenticada y nunca
  un `cliente_id` enviado por el cliente HTTP; la operación MUST impedir que A
  vincule o consulte dispositivos de B.
- **FR-006**: Toda validación, autorización, estado de dispositivo, token o secreto
  inválido MUST responder con el mismo status, estructura y mensaje genérico, sin
  revelar qué condición falló.
- **FR-007**: El endpoint MUST aplicar rate limit específico para enrolamiento y
  registrar los rechazos de límite sin incluir secretos, tokens ni credenciales.
- **FR-008**: Tras validar la solicitud, el sistema MUST crear mediante
  dynamic-security un usuario MQTT y un rol con permisos limitados al topic del
  dispositivo; no debe conceder acceso a topics de otro dispositivo.
- **FR-009**: Las credenciales MQTT resultantes MUST devolverse exactamente una vez,
  solo en la respuesta exitosa del enrolamiento, y MUST omitirse en respuestas
  posteriores, logs, auditoría y mensajes de error.
- **FR-010**: La operación MUST ser atómica desde la perspectiva del sistema: ante
  un fallo de dynamic-security o de persistencia local, no debe dejar un vínculo
  activo a medias, un token consumido sin enrolamiento válido ni usuario o rol MQTT
  huérfano.
- **FR-011**: El rollback MUST ser explícito y seguro ante errores parciales; si
  no puede confirmarse, el dispositivo no debe marcarse como enrolado y debe
  emitirse un log sanitizado en stderr que requiera resolución manual, sin
  exponer secretos. Esta feature no crea una cola o tabla de incidentes.
- **FR-012**: El sistema MUST conservar el contrato de lecturas y permitir que la
  identidad MQTT publique solo en `ecotrack/<device_id>/lecturas` y no pueda publicar
  ni suscribirse a topics de otro dispositivo.
- **FR-013**: El backend MUST cubrir con tests unitarios el endpoint, los rechazos
  genéricos, el rate limit, la comparación en tiempo constante, la unicidad del
  token, el rollback y el doble de MQTT.
- **FR-014**: Las pruebas MUST incluir al menos dos clientes aislados (A y B), un
  dispositivo por cliente y verificaciones de publicación propia, publicación
  cruzada y suscripción cruzada.
- **FR-015**: Los errores y eventos de auditoría MUST conservar trazabilidad
  suficiente para diagnosticar el intento sin registrar secretos en claro ni
  identificadores sensibles completos.
- **FR-016**: El endpoint MUST rechazar cualquier intento sin HTTPS o fuera del
  límite de solicitudes, usando el mismo error genérico cuando corresponda. La
  sesión administrativa no forma parte de esta llamada y se valida en el reclamo
  previo del dashboard.
- **FR-017**: El firmware MUST validar el certificado del backend con la CA
  embebida, usando `serverHost` como hostname HTTPS en el puerto 443 y sin
  `setInsecure()` ni equivalentes.
- **FR-018**: La terminación TLS MUST ejecutarse en nginx o proxy equivalente en
  `443`, reenviar `/api/dispositivos/enrolar` al backend interno en `3000`, usar un
  certificado con SAN igual a `serverHost` y mantener las claves fuera del
  repositorio.
- **FR-019**: Debe existir un script reproducible para emitir el certificado del
  proxy firmado por la misma CA de `ecotrack_ca.h`, sin guardar claves privadas ni
  certificados operativos en el repositorio.

### Key Entities

- **Dispositivo pendiente de enrolamiento**: equipo con `device_id`, estado sin
  dueño, hash del secreto de fábrica y estado del reclamo previo.
- **Token de alta**: valor aleatorio, ligado a un dispositivo y cliente, con estado
  disponible/consumido/revocado y consumo atómico.
- **Credencial MQTT**: usuario y secreto generados para el dispositivo, entregados
  una sola vez y almacenados solo en las ubicaciones autorizadas por la operación.
- **Rol MQTT**: conjunto de permisos limitado al topic del dispositivo.
- **Vínculo de cliente**: relación entre dispositivo y `cliente_id`, con transición
  atómica de pendiente a enrolado.
- **Resultado de enrolamiento**: respuesta única de éxito o error genérico, sin
  filtrar la razón interna del rechazo.

## Success Criteria

### Measurable Outcomes

- **SC-001**: En el flujo válido, 100% de las solicitudes de prueba exitosas
  entregan las credenciales MQTT una sola vez y 0 solicitudes posteriores las
  vuelven a entregar.
- **SC-002**: En la matriz de clientes A/B, 100% de los intentos propios permitidos
  pasan y 100% de los intentos cruzados de publicación y suscripción son rechazados.
- **SC-003**: Todas las categorías de rechazo definidas devuelven exactamente la
  misma respuesta pública y ninguna incluye secretos, tokens completos o detalles
  de existencia.
- **SC-004**: En pruebas de error y concurrencia, 0 dispositivos quedan vinculados
  sin identidad MQTT válida y 0 identidades MQTT quedan activas sin vínculo local,
  salvo incidentes explícitamente marcados para resolución.
- **SC-005**: El rate limit bloquea el 100% de las solicitudes que exceden la ventana
  configurada y permite las solicitudes dentro de ella según la política aprobada.
- **SC-006**: La suite unitaria cubre el doble de MQTT y los escenarios de dos
  clientes A/B sin depender de un broker real, y sus resultados son reproducibles.
- **SC-007**: La inspección de logs y auditoría de todas las pruebas encuentra 0
  secretos de fábrica, credenciales MQTT o tokens completos.

## Assumptions

- El código de alta y token se generan y consumen por el flujo administrativo
  existente del dashboard; el endpoint no recibe esos valores.
- El usuario del dashboard es administrador del cliente que reclama el dispositivo;
  el firmware no participa en el reclamo. La llamada de enrolamiento no porta ni
  valida un JWT de dashboard.
- El hash del secreto de fábrica se registra durante el aprovisionamiento y se
  conserva fuera del firmware y del repositorio.
- Si falla la compensación, la observabilidad se limita deliberadamente al log
  sanitizado en stderr ya existente; no se agrega persistencia de incidentes en
  esta feature porque no hay un consumidor operativo definido.
- Dynamic-security ofrece operaciones de creación y revocación suficientes para
  compensar fallos parciales; si no puede garantizarse una operación, se documenta
  el incidente y no se marca el dispositivo como enrolado.
- La entrega única se implementa como respuesta HTTPS; el backend no recupera ni
  reemite credenciales MQTT después de la respuesta inicial.
- La prueba de aceptación usa un doble de MQTT para la suite unitaria; la validación
  con broker real y dispositivo físico se considera evidencia adicional y no se
  inventa si no se ejecuta.
- La política inicial de rate limit se reutiliza del control de acceso existente y
  se fija en el plan antes de implementar, sin permitir intentos ilimitados.
- `serverHost` es un hostname resoluble y se usa también como SAN del certificado
  HTTPS; no se usa una dirección IP como identidad del certificado.
