# Feature Specification: Panel global de dueños de plataforma

**Feature Branch**: `018-panel-duenos-platform-admin`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "Crear un panel, solo para el rol platform_admin, que permita ver todos los clientes y dispositivos, consultar estado de ciclo de vida y firmware, y resetear credenciales desde la interfaz."

## Fuera de alcance

- Fabricar, importar, provisionar, reclamar o liberar dispositivos.
- Crear, editar o eliminar clientes y usuarios desde la API o el panel.
- Mostrar o exportar secretos, hashes, tokens de reclamo, contraseñas o
  credenciales MQTT.
- Modificar el enrolamiento, Dynamic Security, la política de recuperación del
  firmware o las reglas de aislamiento existentes.
- Reclamar dispositivos automáticamente o por lote.
- Convertir al `platform_admin` en un administrador operativo de ningún cliente.

## Entorno de pruebas y migraciones

- Las pruebas de integración usan exclusivamente la base PostgreSQL aislada
  `ecotrack_test` del contenedor `ecotrack_pg_test`, publicada en
  `127.0.0.1:5433`, mediante `TEST_DATABASE_URL`.
- Las guardas existentes deben rechazar URLs sin base de pruebas (`*_test` o
  `hardening_*`) y no deben usar la base de desarrollo ni el puerto `5432`.
- `backend/src/config/migrate.js` no ejecuta automáticamente
  `backend/migrations/*.sql`: crea y actualiza el esquema mediante SQL inline.
  Por eso, una base nueva recibe actualmente las estructuras equivalentes a
  `014_factory_devices.sql` y `015_firmware_version.sql` desde ese inicializador,
  no mediante la aplicación de esos archivos ni de un historial de migraciones.
- Antes de US1 debe existir un runner idempotente para aplicar las migraciones
  numeradas a cualquier base de test inicializada, incluyendo `016` a `019`, y
  una prueba que lo verifique en una base nueva y en una segunda ejecución.

## User Scenarios & Testing

### User Story 1 - Consultar el inventario global (Priority: P1)

Como dueño de la plataforma, quiero consultar clientes y dispositivos de todos los
clientes para conocer el inventario, el estado de ciclo de vida y la versión de
firmware sin acceder directamente a la base de datos o al broker.

**Why this priority**: Es la capacidad principal del panel y permite operar la
plataforma multi-cliente desde una única vista de solo lectura.

**Independent Test**: Con datos de al menos dos clientes y dispositivos en los tres
estados de ciclo de vida, iniciar sesión como `platform_admin`, abrir el panel y
verificar que los conteos, filtros y datos visibles coinciden con el inventario.

**Acceptance Scenarios**:

1. **Given** un `platform_admin` autenticado y dispositivos de varios clientes,
   **When** consulta el resumen y el listado, **Then** ve todos los clientes,
   dispositivos, estados y versiones sin datos secretos.
2. **Given** un listado que supera el límite de una página, **When** aplica paginación
   y filtros por cliente, estado o firmware, **Then** recibe únicamente los resultados
   correspondientes y los límites máximos son respetados.
3. **Given** dispositivos fabricados, reclamados sin enrolar y enrolados, **When**
   consulta el listado, **Then** cada uno aparece con exactamente el estado derivado
   que corresponde.

---

### User Story 2 - Restablecer credenciales desde el panel (Priority: P1)

Como dueño de la plataforma, quiero restablecer las credenciales de un dispositivo
desde su fila, con confirmación, para devolverlo a reclamado sin enrolar sin perder
la relación con su cliente.

**Why this priority**: Permite recuperar dispositivos operativos sin intervención
manual en servicios internos, manteniendo el comportamiento seguro y auditable de la
spec 016.

**Independent Test**: Con un dispositivo enrolado, confirmar el reset desde el panel,
verificar la transición de estado, repetir la acción para comprobar idempotencia y
consultar la auditoría sin encontrar secretos.

**Acceptance Scenarios**:

1. **Given** un dispositivo enrolado y un `platform_admin`, **When** confirma el
   reset, **Then** se ejecuta la operación existente de reset y el dispositivo queda
   reclamado sin enrolar, conservando su fecha de reclamo.
2. **Given** un dispositivo ya reseteado, **When** el administrador solicita el reset
   nuevamente, **Then** recibe un resultado idempotente y no se crean ni eliminan
   recursos adicionales.
3. **Given** un reset confirmado, **When** se consulta la auditoría, **Then** consta
   quién, cuándo, dispositivo y resultado, sin secretos, hashes, tokens ni contraseñas.
4. **Given** un código inexistente o no elegible, **When** se solicita el reset,
   **Then** se devuelve un error genérico que no permite inferir existencia ni expone
   detalles internos.

---

### User Story 3 - Mantener aislamiento y acceso restringido (Priority: P1)

Como responsable de seguridad, quiero que solo los dueños de plataforma puedan usar
el panel y que los demás usuarios no puedan obtener sus datos por sus endpoints.

**Why this priority**: Una vista global aumenta el impacto de una autorización
incorrecta y no debe debilitar el aislamiento existente entre clientes.

**Independent Test**: Probar todos los endpoints con ausencia de token, token inválido,
rol `admin` de cliente y un rol operativo; verificar 401 o 403 según corresponda y
confirmar que ninguna respuesta contiene campos secretos.

**Acceptance Scenarios**:

1. **Given** una solicitud sin token o con token inválido, **When** accede a cualquier
   recurso del panel, **Then** recibe 401.
2. **Given** un usuario que no tiene rol `platform_admin`, **When** accede a cualquier
   recurso del panel, **Then** recibe 403 y no obtiene datos globales.
3. **Given** un administrador de un cliente, **When** usa rutas existentes o nuevas,
   **Then** conserva el aislamiento de su cliente y no ve dispositivos de otro cliente.
4. **Given** cualquier respuesta del panel, **When** se inspeccionan sus campos,
   **Then** solo contiene la lista blanca de datos operativos permitidos.

### Edge Cases

- Un cliente sin dispositivos debe aparecer con conteos en cero.
- Un dispositivo sin versión reportada o sin fecha de reporte debe mostrar un valor
  explícito de ausencia, sin inventar una versión.
- Valores de paginación inválidos, filtros desconocidos o límites sobre el máximo
  permitido deben rechazarse con un error de validación.
- Un reset concurrente con otro reset o enrolamiento debe conservar una única
  transición válida y no producir un estado falso.
- Una falla del servicio reutilizado de reset no debe dejar una respuesta de éxito ni
  registrar secretos.
- Un usuario `platform_admin` no debe requerir pertenecer a un cliente operativo.
- El panel no debe renderizarse ni ofrecer acciones a roles distintos de
  `platform_admin`; esta ocultación no reemplaza la autorización del backend.

## Requirements

### Functional Requirements

- **FR-001**: El sistema MUST reconocer `platform_admin` como rol distinto de
  `admin` de cliente. El constraint de roles debe aceptar ambos roles y el
  `platform_admin` debe modelarse asociado a un cliente especial de plataforma
  (opción A), creado únicamente mediante mecanismos administrativos locales,
  nunca mediante una API pública o el panel. Ese cliente especial MUST quedar
  excluido de los listados y conteos de clientes y dispositivos operativos.
- **FR-002**: El sistema MUST permitir a un `platform_admin` consultar un resumen con
  totales de clientes, dispositivos por estado de ciclo de vida y distribución de
  versiones de firmware.
- **FR-003**: El sistema MUST listar todos los clientes con su identificador, nombre
  y cantidad de dispositivos en cada estado de ciclo de vida.
- **FR-004**: El sistema MUST listar dispositivos de todos los clientes con una lista
  blanca que incluya únicamente código, cliente, nombre, estado de ciclo de vida,
  versión de firmware, fecha de reporte, última lectura, fecha de reclamo, fecha de
  enrolamiento y estado online/offline.
- **FR-005**: El sistema MUST permitir paginar el listado y filtrarlo por cliente,
  estado de ciclo de vida y versión de firmware, con valores y límites máximos
  validados.
- **FR-006**: El cliente especial “plataforma” MUST excluirse también cuando se
  utilice el filtro `cliente_id` del listado: no debe aparecer como resultado,
  opción de filtro operativo ni conteo. Ningún chequeo de rol existente MUST
  conceder a `platform_admin` los permisos de `admin`; T2 MUST probar al
  `platform_admin` contra las rutas de cliente y confirmar que no obtiene ni
  permisos administrativos ni acceso fuera de las rutas explícitas del panel.
- **FR-007**: El sistema MUST derivar de forma única y testeada los estados
  `fabricado` (sin reclamo), `reclamado sin enrolar` y `enrolado`.
- **FR-008**: El sistema MUST calcular online/offline usando la misma lógica
  observable por el recurso existente de estado de dispositivos.
- **FR-009**: Todo recurso del panel MUST exigir autenticación válida y el rol
  `platform_admin`; sin autenticación debe responder 401 y con otro rol debe
  responder 403. La autorización del panel MUST usar un middleware propio que
  no dependa de `extraerCliente`, porque el usuario global no se autoriza por
  el cliente especial.
- **FR-010**: La autorización de un `platform_admin` MUST permitir la vista global
  únicamente en los recursos del panel y no alterar el aislamiento aplicado a
  usuarios de clientes en rutas existentes.
- **FR-011**: El panel MUST exponer recursos bajo `/api/plataforma/...` y su reset
  MUST delegar en el servicio de la spec 016. No se ampliará directamente
  `/api/dispositivos/:codigo/reset-credenciales`: ese endpoint está montado bajo
  el middleware de cliente y su contrato actual es para administradores de un
  cliente; separar el recurso evita mezclar autorización global con aislamiento
  operativo y mantiene explícita la superficie de plataforma.
- **FR-012**: El servicio reutilizado de la spec 016 MUST recibir el identificador
  del dispositivo y el `cliente_id` afectado como argumentos explícitos; MUST
  verificarse que no lea `req.clienteId` ni ningún objeto HTTP internamente.
- **FR-013**: El sistema MUST rechazar cualquier `cliente_id` enviado en el cuerpo
  de una solicitud de reset y determinar el dispositivo objetivo exclusivamente
  por su identificador de ruta.
- **FR-014**: El panel MUST conservar los resultados idempotentes `reset` y
  `already_reset` del servicio de la spec 016, sin duplicar la lógica de Dynamic
  Security.
- **FR-015**: Tras un reset exitoso, el dispositivo MUST quedar reclamado sin enrolar
  y conservar su fecha de reclamo; el fallo MUST comunicarse de forma genérica sin
  presentar un estado exitoso.
- **FR-016**: Cada reset iniciado desde el panel MUST generar un registro de
  auditoría con el `cliente_id` del dispositivo afectado, el actor, fecha,
  dispositivo y resultado, sin secretos, hashes, tokens, contraseñas ni
  credenciales MQTT. El actor `platform_admin` no determina el `cliente_id` de
  auditoría: se registra el cliente operativo dueño del dispositivo para
  satisfacer la FK `auditoria_cliente_id_fkey` y conservar trazabilidad
  multi-cliente.
- **FR-017**: La auditoría visible para el cliente MUST mostrar el actor de un
  reset originado en el panel como `Administración de la plataforma`, sin
  exponer el email, username o nombre del `platform_admin`.
- **FR-018**: El endpoint de reset del panel MUST estar sujeto a rate limit y los
  errores de un dispositivo inexistente o no elegible MUST no revelar su existencia.
- **FR-019**: Las respuestas del panel MUST omitir cualquier campo secreto o hash,
  incluso si existe en las entidades persistidas, y un test MUST detectar una
  violación de esa lista blanca.
- **FR-020**: La interfaz MUST ofrecer una ruta separada del panel global en el mismo
  origen, mostrarla solo a `platform_admin`, presentar filtros y estados, y exigir
  confirmación explícita antes del reset.
- **FR-021**: La interfaz MUST mostrar un resultado genérico del reset y no detalles
  internos de credenciales, broker, hashes o errores de persistencia.
- **FR-022**: La funcionalidad MUST incluir pruebas de autorización, aislamiento,
  lista blanca, estados, reset idempotente, auditoría, paginación, filtros, límites
  y visibilidad condicionada del panel.
- **FR-023**: Las solicitudes del panel MUST enviar el JWT crudo en el header
  `Authorization`, sin el prefijo `Bearer`, de acuerdo con el middleware actual.
- **FR-024**: El campo “última lectura” del panel MUST representar el timestamp de
  captura más reciente en `lecturas.timestamp`, mientras que “última conexión”
  MUST representar la recepción MQTT más reciente (`dispositivos.ultima_conexion`).
  Ambos campos deben mostrarse por separado; una lectura diferida no puede
  reemplazar la última conexión.
- **FR-025**: Las pruebas de integración MUST reutilizar las guardas existentes
  para `TEST_DATABASE_URL` y su aislamiento. No se agregará una guarda nueva ni
  se aceptará ejecutar accidentalmente contra la base de desarrollo.

### Key Entities

- **Cliente**: organización propietaria de dispositivos, identificada por un
  identificador y nombre, con conteos por estado.
- **Dispositivo**: unidad fabricada que puede no tener reclamo, estar reclamada sin
  enrolar o estar enrolada; incluye datos operativos y de firmware no sensibles.
- **Estado de ciclo de vida**: clasificación derivada de reclamo y enrolamiento,
  independiente del estado online/offline.
- **Reporte de firmware**: versión declarada por el dispositivo y fecha del último
  reporte, pudiendo faltar si nunca fue reportada.
- **Registro de auditoría**: evento de una acción de plataforma con actor, instante,
  dispositivo y resultado, sin material secreto.
- **Platform admin**: usuario con autorización global de solo lectura y permiso
  específico para resetear credenciales; no pertenece a un cliente operativo normal.

## A confirmar en el repo

- El constraint actual de `usuarios.rol` solo acepta `admin` y `comun`; la
  implementación deberá ampliar ese constraint para aceptar `platform_admin`.
- `cliente_id` es actualmente obligatorio para usuarios y el middleware
  `extraerCliente` rechaza tokens sin cliente. Se adoptó la opción A: usar un
  cliente especial “plataforma”, excluido de listados y conteos operativos, y
  autorizar el panel mediante middleware propio sin `extraerCliente`.
- `auditoria.cliente_id` es obligatorio y referencia `clientes(id)` mediante
  `auditoria_cliente_id_fkey`; por decisión de esta spec, cada acción global
  registra el cliente operativo del dispositivo afectado y conserva por separado
  el actor `platform_admin`.
- `enrolled_at` está en `dispositivos_fabrica.enrolled_at`, no en
  `dispositivos`.
- El estado online/offline existente deriva de `dispositivos.ultima_conexion`,
  con `online` dentro de los dos minutos, `offline` después y
  `nunca_conectado` cuando no existe conexión.
- La “última lectura” debe obtenerse de la lectura más reciente por timestamp de
  captura en `lecturas.timestamp`; no debe confundirse con `ultima_conexion`.
- El frontend actual es HTML estático con navegación y sesión compartidas en
  `frontend/shared/app.js` y `frontend/shared/sidebar.html`; hoy solo distingue
  `admin` de usuario común y deberá incorporar la visibilidad específica de
  `platform_admin`.
- El endpoint existente de reset requiere `admin`, usa `req.clienteId` en la ruta
  de dispositivos, y el servicio actual recibe `clienteId` como argumento; se
  debe verificar en implementación que no dependa de objetos HTTP.
- La línea base medida en `ecotrack_pg_test` (`127.0.0.1:5433`) fue de 261 de
  294 tests: 1 fallo conocido, el subtest 13 de continuidad, con causa aún sin
  diagnosticar: la partición del mes anterior existe; además hubo 32 tests
  `todo`.
- Las referencias de esta feature a `docs/requisitos.md` fueron verificadas:
  RF12, RF14, RF17, RF18, RF19, RI01, RI06, RI08, RI14, RI15, RI17, RI18,
  RNF01, RNF03, RNF05, RNF07, RNF08 y RNF09 existen. El panel global y
  `platform_admin` son una extensión no descrita explícitamente en ese
  documento y no sustituyen sus reglas de aislamiento.

## Success Criteria

### Measurable Outcomes

- **SC-001**: El 100% de las solicitudes del panel sin autenticación válida o con un
  rol distinto de `platform_admin` recibe el código de rechazo correspondiente y no
  obtiene datos del panel.
- **SC-002**: En una prueba con al menos dos clientes y 100 dispositivos, un
  `platform_admin` puede encontrar cualquier dispositivo mediante paginación y
  filtros sin consultar fuentes internas.
- **SC-003**: El 100% de los dispositivos de prueba aparece en exactamente uno de los
  tres estados de ciclo de vida y el 100% de los resets exitosos refleja la transición
  a reclamado sin enrolar conservando la fecha de reclamo.
- **SC-004**: El segundo reset de cada dispositivo ya reseteado devuelve el resultado
  idempotente definido y no produce cambios adicionales.
- **SC-005**: El 100% de las respuestas y registros de auditoría revisados durante
  las pruebas carece de secretos, hashes, tokens, contraseñas y credenciales MQTT.
- **SC-006**: Un usuario de cliente no puede observar datos de otro cliente mediante
  ninguna ruta existente o nueva en la suite de regresión de aislamiento.
- **SC-007**: En la suite de autorización, el 100% de las solicitudes de un
  `platform_admin` a rutas de cliente recibe únicamente el resultado permitido
  por su rol (sin permisos de `admin`), mientras que el 100% de sus solicitudes
  a `/api/plataforma/...` autorizadas devuelve datos globales sin incluir el
  cliente especial “plataforma”.

## Assumptions

- El estado de enrolamiento seguirá siendo el atributo persistido existente en
  `dispositivos_fabrica.enrolled_at`, conforme a la spec 016.
- El servicio existente de reset de credenciales es la única fuente de verdad para
  la eliminación de recursos MQTT y su compensación.
- El rol `platform_admin` se sembrará o creará mediante un script o seed local
  controlado y tendrá el cliente especial “plataforma”; ese cliente no aparecerá
  en los recursos operativos globales.
- La lógica existente de autenticación usa el formato de header actualmente
  establecido por el proyecto: `Authorization` con JWT crudo, sin `Bearer`.
- El panel será servido por el mismo origen y no requerirá dependencias externas
  nuevas.
- Los datos globales son de solo lectura; el reset es la única escritura permitida.
- Las guardas actuales de tests seguirán siendo la protección para usar una base
  de pruebas aislada; la feature no cambiará su criterio.
- La feature implementa los casos de uso relacionados con RF12, RF14, RF17, RF18,
  RF19, RI01, RI06, RI08, RI14, RI15, RI17, RI18 y RNF01, RNF03, RNF05, RNF07,
  RNF08 y RNF09 de `docs/requisitos.md`; el rol global es una extensión del modelo
  actual y no reemplaza el aislamiento por cliente.
