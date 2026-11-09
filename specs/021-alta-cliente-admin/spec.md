# Feature Specification: Alta de cliente y administrador inicial

**Feature Branch**: `021-alta-cliente-admin`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Nueva feature: alta de cliente y de su usuario admin inicial desde el panel de plataforma."

## Relación con specs anteriores

La spec 018 excluye explícitamente crear clientes y usuarios desde la API o el panel.
Su US2 cubre únicamente el reset de credenciales de dispositivos y su US3 cubre
autorización y aislamiento del panel. No existe un `spec.md` de la Feature 020 en
`specs/`; la cobertura disponible está en los tests de fabricación de dispositivos.
Por lo tanto, esta funcionalidad no está cubierta por una US2 o US3 anterior y amplía
el alcance administrativo del panel de plataforma.

## Clarifications

### Session 2026-11-09

- Q: ¿Cómo debe distinguirse el alta de un cliente nuevo del alta de un administrador para un cliente existente? → A: El alta de cliente nuevo usa `POST /api/plataforma/clientes` con nombre del cliente, username, nombre visible y motivo. El alta para cliente existente usa `POST /api/plataforma/clientes/:id/admin` con username, nombre visible y motivo; el id va en la ruta y no en el cuerpo. En ambos payloads se hace `trim` de `nombre_cliente`, `username` y `nombre_admin`, se convierte `username` a minúsculas y la respuesta devuelve el username normalizado.
- Q: ¿Qué debe devolver el primer login con contraseña temporal mientras el cambio obligatorio está pendiente? → A: Debe responder 200 con una sesión restringida y una bandera de cambio obligatorio; el servidor debe limitar esa sesión a los endpoints permitidos hasta completar el cambio.
- Q: ¿Qué reglas exactas deben aplicar al nombre del cliente y al username del administrador? → A: Se reutilizan los límites actuales: nombre de cliente de 1 a 100 caracteres y username de 3 a 50 caracteres, sin cambiar el conjunto de caracteres permitido.

## Fuera de alcance

- Crear clientes desde usuarios que no sean `platform_admin`.
- Crear más usuarios para el cliente después del alta inicial; se seguirá usando la
  gestión de usuarios existente.
- Editar, eliminar, desactivar o fusionar clientes.
- Mostrar, recuperar o volver a emitir la contraseña temporal después de cerrar el
  resultado inicial.
- Descargar el resultado o la contraseña desde el modal; solo se permite copiar la
  contraseña temporal mientras el resultado está visible.
- Enviar la contraseña por correo, mensajería u otro canal externo.
- Cambiar roles, crear usuarios `platform_admin` o modificar el cliente especial de
  plataforma desde este flujo.
- Migrar dispositivos, reclamar dispositivos o alterar el aprovisionamiento de
  dispositivos de la Feature 020.

## User Scenarios & Testing

### User Story 1 - Crear cliente y administrador inicial (Priority: P1)

Como `platform_admin`, quiero registrar un cliente y su usuario administrador inicial
desde el panel de plataforma para entregar un acceso operativo sin intervención
directa en la base de datos.

**Why this priority**: Es el flujo mínimo para incorporar una nueva organización al
sistema de forma controlada, auditable y transaccional.

**Independent Test**: Con una base PostgreSQL temporal y un `platform_admin`
autenticado, enviar un alta válida y verificar que existe exactamente un cliente y
un usuario `admin` asociado, que la contraseña persistida no está en texto plano y
que la respuesta muestra la contraseña temporal una sola vez.

**Acceptance Scenarios**:

1. **Given** un `platform_admin` autenticado y datos válidos de cliente y usuario,
   **When** confirma el alta, **Then** se crean el cliente y exactamente un usuario
   `admin` asociado, y la respuesta contiene únicamente los datos necesarios y la
   contraseña temporal.
2. **Given** un alta válida, **When** se inspecciona la persistencia, **Then** la
   contraseña temporal no aparece en texto plano y el usuario puede iniciar sesión
   con ella.
3. **Given** un resultado de alta mostrado en el modal, **When** el administrador lo
   cierra, **Then** la contraseña temporal se elimina del DOM y de las variables del
   resultado, y no puede recuperarse desde el panel.
4. **Given** una contraseña temporal ya entregada, **When** el usuario inicia sesión
   por primera vez, **Then** recibe una sesión restringida con una indicación de
   cambio obligatorio y debe cambiarla antes de acceder a las funciones operativas;
   después del cambio, la contraseña temporal deja de ser válida.

El alta de cliente nuevo se expone mediante `POST /api/plataforma/clientes` y recibe
el nombre del cliente, username, nombre visible y motivo.

### User Story 2 - Rechazar solicitudes no autorizadas o inválidas (Priority: P1)

Como responsable de la plataforma, quiero que solo un `platform_admin` pueda crear
clientes y que los datos inválidos no creen registros parciales.

**Why this priority**: El alta crea una nueva frontera de aislamiento y un usuario
con privilegios administrativos; un error de autorización o validación tendría
impacto global.

**Independent Test**: Ejecutar el endpoint real con ausencia de token, tokens de
`admin` y `operario1`, payloads con campos extra, datos inválidos y usernames o
clientes duplicados; comprobar códigos de respuesta y ausencia de filas parciales.

**Acceptance Scenarios**:

1. **Given** una solicitud sin sesión, **When** invoca el endpoint, **Then** recibe
   401 y no se modifica la base.
2. **Given** un usuario `admin` de cliente o `operario1`, **When** invoca el
   endpoint, **Then** recibe 403 y no se modifica la base.
3. **Given** un `platform_admin` con un payload inválido o campos no permitidos,
   **When** envía la solicitud, **Then** recibe 400 y no se modifica la base.
4. **Given** un nombre de cliente o username ya existente, **When** intenta el alta,
   **Then** recibe un error sanitizado y no se crea una entidad parcial.

### User Story 3 - Mantener seguridad, trazabilidad y operación controlada (Priority: P1)

Como responsable de seguridad, quiero que cada alta sea atómica, limitada y
auditable sin exponer credenciales.

**Why this priority**: La contraseña temporal es un secreto de alta y la operación
afecta dos entidades relacionadas; una auditoría incompleta o una fuga invalida el
propósito del flujo.

**Independent Test**: Forzar fallos durante la creación del cliente, del usuario y de
la auditoría sobre PostgreSQL real; comprobar rollback completo, límite por usuario,
auditoría sin secretos y comportamiento del modal mediante mutaciones de una
aserción por vez.

**Acceptance Scenarios**:

1. **Given** que falla la creación del usuario, **When** se procesa el alta, **Then**
   no queda ningún cliente ni usuario nuevo.
2. **Given** que falla la auditoría, **When** se procesa el alta, **Then** se revierte
   el cliente y el usuario, y la respuesta no es de éxito.
3. **Given** un `platform_admin` que alcanza el límite configurado, **When** realiza
   otra solicitud dentro de la ventana, **Then** recibe 429; otro usuario autenticado
   mantiene un contador independiente.
4. **Given** una alta exitosa, **When** se inspeccionan auditoría, logs y respuestas
   posteriores, **Then** no contienen la contraseña temporal, hashes, tokens ni
   credenciales.
5. **Given** el modal abierto, **When** el administrador copia la contraseña o
   cierra el resultado, **Then** los valores dinámicos se asignan con `textContent`,
   la contraseña se limpia del DOM y las variables se limpian al cerrar.

### User Story 4 - Crear un administrador para un cliente existente (Priority: P2)

Como `platform_admin`, quiero crear el administrador inicial de un cliente existente
que todavía no tiene administrador para completar su incorporación sin duplicar el
cliente.

**Why this priority**: Permite recuperar o completar altas iniciadas fuera del flujo
principal sin crear organizaciones duplicadas.

**Independent Test**: Con un cliente existente sin usuarios `admin`, crear su
administrador inicial y verificar la asociación, la contraseña temporal y la
obligación de cambio en el primer acceso.

**Acceptance Scenarios**:

1. **Given** un cliente existente sin usuario `admin`, **When** el
   `platform_admin` solicita el alta con su identificador permitido, **Then** se crea
   un único administrador asociado y se muestra la contraseña temporal una sola vez.
2. **Given** un cliente que ya tiene un administrador, **When** se solicita otro
   administrador inicial, **Then** se rechaza la operación sin modificar el cliente
   ni crear un usuario parcial.
3. **Given** un cliente inexistente, **When** se solicita crearle un administrador
   mediante este flujo, **Then** se devuelve un error sanitizado y no se crea ningún
   cliente implícito.

El alta para un cliente existente se expone mediante
`POST /api/plataforma/clientes/:id/admin`; el identificador se toma exclusivamente de
la ruta y nunca del cuerpo.

### Edge Cases

- El nombre del cliente vacío, con espacios, demasiado corto, demasiado largo o con
  caracteres no permitidos debe rechazarse sin insertar filas.
- Los nombres de cliente y usernames se comparan sin distinguir mayúsculas; por
  ejemplo, `Acme` y `acme` representan el mismo cliente, y `Admin` y `admin` el
  mismo username.
- `platform_admin`, `plataforma` y `root` son usernames reservados, comparados en
  minúsculas y rechazados con un error sanitizado. `plataforma` es también un nombre
  de cliente reservado, comparado después de normalizar.
- El username duplicado globalmente debe rechazarse sin crear un segundo cliente.
- Un fallo de unicidad concurrente debe producir un error genérico y rollback.
- `POST /api/plataforma/clientes` debe rechazar cualquier campo adicional, incluyendo
  `cliente_id`, `rol`, `password`, `password_hash` o una contraseña elegida por el
  solicitante. `POST /api/plataforma/clientes/:id/admin` debe rechazar `cliente_id`
  en el cuerpo y tomar el id exclusivamente de la ruta.
- El nombre del cliente y el username deben validar sus longitudes y formato; el
  `motivo` es obligatorio, se recorta y debe tener entre 3 y 200 caracteres.
- La contraseña temporal debe cumplir la política vigente, generarse con CSPRNG
  usando un alfabeto sin caracteres ambiguos y no aparecer en logs,
  auditoría, listados ni respuestas posteriores.
- Cerrar, recargar o volver a abrir el modal no debe recuperar una contraseña ya
  entregada.
- El límite debe usar una clave separada de lectura, reset y fabricación, y contar
  por identidad autenticada.
- Una falla al auditar debe ser fail-closed, aunque cliente y usuario ya hayan sido
  insertados dentro de la transacción.
- La respuesta de error no debe revelar si el conflicto fue de cliente, username,
  constraint o persistencia interna.

## Requirements

### Functional Requirements

- **FR-001**: `POST /api/plataforma/clientes` MUST crear un cliente y su primer
  usuario administrador en una única transacción.
- **FR-002**: `POST /api/plataforma/clientes` MUST aceptar únicamente `{ nombre_cliente,
  username, nombre_admin, motivo }`; `POST /api/plataforma/clientes/:id/admin` MUST
  aceptar únicamente `{ username, nombre_admin, motivo }`. En ambos casos `motivo`
  MUST recortarse y tener entre 3 y 200 caracteres. `nombre_cliente`, `username` y
  `nombre_admin` MUST recortarse; `username` MUST convertirse a minúsculas y la
  respuesta MUST devolver ese username normalizado. Ninguna ruta debe aceptar roles,
  contraseñas ni identificadores asignados por el cliente en el cuerpo.
- **FR-003**: El sistema MUST exigir autenticación y autorización `platform_admin`;
  solicitudes sin sesión deben recibir 401 y otros roles 403.
- **FR-004**: El sistema MUST validar el payload con los límites existentes de
  nombre de cliente de 1 a 100 caracteres y username de 3 a 50 caracteres, y
  rechazar campos adicionales con 400 sin introducir un nuevo conjunto de caracteres
  permitido.
- **FR-004a**: El sistema MUST comparar `clientes.nombre` y `usuarios.username` sin
  distinguir mayúsculas. Debe aplicar índices únicos sobre `lower(nombre)` y
  `lower(username)` mediante una migración idempotente. La migración MUST abortar
  sin crear índices si detecta cualquier colisión histórica por `lower()`; la
  resolución debe completarse y verificarse antes del despliegue. La comprobación
  previa dentro de la transacción es complementaria y no reemplaza el índice.
- **FR-004b**: El sistema MUST rechazar los usernames normalizados
  `platform_admin`, `plataforma` y `root`, y el nombre de cliente normalizado
  `plataforma`, con un error de aplicación sanitizado y sin revelar constraints.
- **FR-005**: El sistema MUST generar la contraseña temporal en el servidor con un
  CSPRNG, con al menos 16 caracteres y un alfabeto explícito sin caracteres
  ambiguos (`0`, `O`, `1`, `I`, `l`), validarla contra la política vigente,
  hashearla antes de persistirla y devolverla únicamente en la respuesta inmediata
  de alta.
- **FR-006**: El sistema MUST marcar la cuenta para cambio obligatorio de contraseña
  en el primer login. El login exitoso MUST responder 200 con una sesión restringida
  y una bandera de cambio obligatorio. Mientras esté pendiente, el servidor permitirá
  únicamente `POST /api/auth/login`, `GET /api/auth/me` para la información mínima
  de sesión y `POST /api/auth/change-password`; deberá bloquear en servidor,
  consultando el estado persistido en la base y no solo un claim del JWT, las rutas
  operativas, administrativas y de cliente. El frontend debe mostrar una pantalla
  de cambio obligatorio y no mostrar el dashboard hasta recibir confirmación de
  cambio exitoso. Las rutas HTTP bloqueadas MUST responder 403 con el código estable
  `PASSWORD_CHANGE_REQUIRED`. El cambio exitoso MUST incrementar `token_version`, invalidar las
  sesiones anteriores y devolver un JWT nuevo con `tv` actualizado para continuar
  sin re-login y sin la obligación pendiente.
- **FR-007**: El sistema MUST devolver una lista blanca que no incluya hashes,
  contraseñas persistidas, tokens de sesión ni datos internos de la transacción.
- **FR-008**: Cliente, usuario y auditoría MUST confirmarse o revertirse como una
  unidad; una falla en cualquier paso MUST dejar cero filas nuevas de esas entidades.
- **FR-009**: La auditoría MUST registrar actor `platform_admin`, el usuario creado,
  el cliente creado, el `motivo` y el resultado, sin contraseña temporal, hash ni
  token. Su `cliente_id` MUST ser el del cliente especial de plataforma asociado al
  actor `platform_admin`; así las auditorías globales quedan fuera de las consultas
  y vistas de cualquier tenant operativo, sin atribuir la acción global al cliente
  recién creado.
- **FR-010**: La auditoría MUST ser fail-closed: si no puede registrarse, la
  transacción MUST revertirse y la respuesta no debe indicar éxito.
- **FR-011**: El sistema MUST aplicar un rate limit propio configurable, con contador
  separado de lectura, reset y fabricación, y con clave por usuario autenticado.
- **FR-012**: Los conflictos de nombre de cliente y username deben responder con
  códigos de error de aplicación distintos (por ejemplo, `CLIENT_NAME_TAKEN` y
  `USERNAME_TAKEN`), aunque compartan el código HTTP 409; no deben exponer
  constraints ni mensajes de la base.
- **FR-013**: Los errores de validación, autorización, conflictos y persistencia MUST
  ser sanitizados y no deben registrar cuerpos completos ni secretos.
- **FR-014**: El modal MUST mostrar la contraseña temporal una sola vez, permitir
  copiarla mientras está visible, asignar todos los valores dinámicos con
  `textContent` y limpiar la contraseña del DOM y las variables al cerrar. No debe
  ofrecer descarga del resultado.
- **FR-015**: El panel MUST actualizar sus datos operativos después de un alta exitosa
  sin exponer la contraseña temporal en tablas, resúmenes ni cargas posteriores.
- **FR-016**: La funcionalidad MUST preservar la creación y gestión existente de
  usuarios dentro de un cliente y no debe permitir crear `platform_admin` desde el
  panel.
- **FR-017**: El login debe encontrar al usuario recién creado usando el username
  normalizado devuelto por el alta. Como el login actual consulta el username por
  igualdad exacta, la prueba de integración debe usar ese valor normalizado; si se
  permite que el usuario escriba variantes con espacios o mayúsculas, el login
  deberá aplicar la misma normalización antes de consultar.
- **FR-018**: En el handshake de Socket.IO el servidor MUST consultar el estado
  persistido de cambio obligatorio, además de la validación vigente de `tv`. Si
  está pendiente, MUST rechazar la conexión con el mismo formato de error de los
  rechazos actuales y `data.code = 'PASSWORD_CHANGE_REQUIRED'`; el cliente MUST
  mostrar el flujo de cambio, desactivar la reconexión y no reintentar en bucle.
- **FR-019**: Las altas concurrentes MUST mantener la unicidad case-insensitive.
  Para el mismo nombre con distinto username prevalece `CLIENT_NAME_TAKEN`; para
  distinto nombre con el mismo username prevalece `USERNAME_TAKEN`; para payload
  idéntico prevalece `CLIENT_NAME_TAKEN` y no se crea ninguna fila parcial. La
  ruta de admin existente MUST bloquear el cliente con `FOR UPDATE`, y cualquier
  `23505` residual debe mapearse a un código sanitizado estable.

### Key Entities

- **Cliente**: organización operativa con nombre único, estado y fecha de creación.
- **Usuario administrador inicial**: cuenta con username globalmente único, nombre
  visible, rol `admin`, cliente asociado y estado de cambio obligatorio de contraseña.
- **Contraseña temporal**: secreto generado para la entrega inicial; solo se muestra
  en el resultado inmediato y se almacena únicamente en forma de hash.
- **Registro de auditoría**: evidencia de actor, cliente, usuario, momento y resultado
  de la operación, sin material secreto.
- **Límite de altas**: contador por `platform_admin` para proteger la operación de
  creación.

## Matriz de pruebas requeridas

| Área | Caso mínimo | Evidencia esperada |
|---|---|---|
| Alta válida | Crear cliente y admin en PostgreSQL real | Una fila de cliente, una de usuario `admin`, relación correcta |
| Normalización | Bordes en nombres, username en mayúsculas y respuesta | Valores persistidos sin bordes; username en minúsculas y respuesta normalizada |
| Unicidad case-insensitive | `Acme` vs `acme`; username `Admin` vs `admin` | Segundo intento rechazado aun bajo concurrencia |
| Concurrencia por conflicto | Mismo nombre/otro username; mismo username/otro nombre; payload idéntico | `CLIENT_NAME_TAKEN`, `USERNAME_TAKEN`, `CLIENT_NAME_TAKEN`, respectivamente; cero filas parciales |
| Reservados | `platform_admin`, `plataforma`, `root` y cliente `plataforma` | Error sanitizado y cero filas parciales |
| Login normalizado | Login con username devuelto por el alta | Login actual encuentra la cuenta creada y autentica correctamente |
| Admin existente | `POST /api/plataforma/clientes/:id/admin` | Crea admin solo si el cliente existe y aún no tiene admin |
| Contraseña | Comparar temporal contra hash persistido | El hash valida la contraseña y no contiene texto plano |
| Primera sesión | Login temporal y cambio obligatorio | 200 con sesión restringida; estado persistido bloquea rutas operativas |
| Socket.IO pendiente | Handshake con usuario pendiente | Rechazo `PASSWORD_CHANGE_REQUIRED`; cliente sin reintento infinito |
| Atomicidad | Fallar en el 2.º paso de 2 y contar antes/después | Cero filas nuevas en cliente, usuario y auditoría |
| Auditoría fail-closed | Forzar error de inserción de auditoría | Rollback completo y no 2xx |
| Autorización | Sin token, `admin`, `operario1`, `platform_admin` | 401, 403, 403 y éxito solo para platform admin |
| Validación | Payload inválido y campos extra | 400, sin filas parciales |
| Conflictos | Cliente duplicado y username duplicado, incluso concurrente | `CLIENT_NAME_TAKEN` y `USERNAME_TAKEN`, mensajes sanitizados y sin alta parcial |
| Rate limit | 5 altas por usuario en 15 minutos | Cinco solicitudes permitidas, sexta 429; contador aislado |
| Secretos | Respuesta, GET, logs y auditoría | Sin contraseña temporal, hash, tokens ni credenciales |
| Frontend | Modal, copia y cierre | `textContent`, sin descarga y limpieza DOM/variables |
| Mutaciones | Comentar cada aserción protegida | El test falla por la razón concreta y luego se restaura |
| Cliente existente | Crear admin para cliente sin admin | Asociación correcta; cliente con admin y cliente inexistente se rechazan |
| Regresión | Usuarios existentes y scripts actuales | Suite previa sin regresiones |

## Success Criteria

### Measurable Outcomes

- **SC-001**: El 100% de las altas válidas de prueba crea exactamente un cliente y
  un administrador inicial asociado, sin duplicados.
- **SC-002**: El 100% de los fallos inducidos antes de confirmar la transacción deja
  cero filas nuevas de cliente, usuario y auditoría.
- **SC-003**: El 100% de los intentos sin autorización recibe 401 o 403 según la
  sesión y no modifica la base.
- **SC-004**: El 100% de las contraseñas temporales revisadas es verificable mediante
  su hash y no aparece en logs, auditoría ni respuestas posteriores.
- **SC-005**: El 100% de los primeros accesos de prueba exige cambio de contraseña y
  el servidor lo verifica contra la base, bloquea rutas operativas, incrementa
  `token_version` e invalida sesiones anteriores; `change-password` devuelve el
  token nuevo con `tv` actualizado, el cliente continúa con ese token sin re-login,
  apaga el marcador y rechaza una contraseña nueva igual a la temporal; después
  del cambio la contraseña temporal deja de ser válida.
- **SC-006**: El límite configurado rechaza el siguiente alta después del máximo y
  mantiene contadores independientes por usuario.
- **SC-007**: El test de mutaciones del modal falla para cada eliminación de
  `textContent`, copia o limpieza de secretos.
- **SC-008**: La suite de regresión de gestión de usuarios, autenticación, panel y
  fabricación de dispositivos permanece sin fallos atribuibles a esta feature.
- **SC-009**: La suite nombrada de Feature 021 termina con 0 fallos y 0 skipped
  cuando se ejecuta con `TEST_DATABASE_URL`; la métrica histórica "todo sin cambios
  (32)" se conserva como comparación de regresión.

## Assumptions

- La base PostgreSQL de integración se selecciona mediante `TEST_DATABASE_URL` y se
  crea temporalmente aplicando todas las migraciones relevantes antes de cada flujo.
- Ya existe `POST /api/auth/change-password`, que valida la contraseña actual y la
  nueva, incrementa `token_version` y devuelve un JWT nuevo; la implementación
  deberá reutilizarlo y agregar el estado persistido de cambio obligatorio, además
  de hacer que el middleware consulte ese estado en la base para bloquear rutas
  mientras esté pendiente.
- La autenticación existente usa bcrypt para el hash, JWT con `token_version` y
  `cliente_id`; la feature conservará esos contratos y no confiará solo en claims
  para el bloqueo inicial.
- `clientes.nombre` tiene unicidad global y `usuarios.username` tiene unicidad
  global mediante constraints sensibles a mayúsculas en el esquema actual; no
  existen índices case-insensitive sobre `lower(...)`. La decisión de esta feature
  es agregar una migración idempotente con índices únicos sobre
  `lower(clientes.nombre)` y `  lower(usuarios.username)`. La migración abortará si detecta colisiones históricas;
  el despliegue deberá detectarlas y resolverlas antes de ejecutarla. La API deberá traducir el
  conflicto de nombre de cliente a un código distinto del conflicto de username,
  sin exponer nombres de constraints ni mensajes de PostgreSQL.
- El username se almacenará normalizado en minúsculas y sin espacios exteriores;
  `nombre_cliente` y `nombre_admin` se almacenarán sin espacios exteriores. El
  login actual usa igualdad exacta, por lo que encuentra la cuenta cuando recibe el
  username normalizado devuelto por el alta; cualquier normalización de variantes
  introducida en login debe conservar ese resultado.
- El seed actual crea un cliente por defecto y usuarios iniciales, pero no existe
  un servicio público separado de alta de clientes ni se requiere una operación
  del broker/MQTT para crear un cliente; el alta es de persistencia, autenticación
  y auditoría.
- El cliente especial de plataforma ya existe conceptualmente para `platform_admin`;
  su `cliente_id` se usará en la auditoría de altas globales y sus filas no deben
  aparecer en listados o auditorías de tenants operativos.
- La contraseña temporal se entrega por la respuesta HTTPS del panel y el navegador
  la muestra solo hasta que el operador cierre el modal; permite copiarla, no
  descargarla, y no se persiste en el frontend después del cierre.
- El rate limit inicial será de 5 altas por usuario en una ventana de 15 minutos,
  configurable de forma independiente, siguiendo la convención de la Feature 020.
- El frontend tratará la bandera del primer login como una sesión restringida,
  mostrará únicamente el cambio obligatorio y conservará el token hasta recibir la
  respuesta exitosa que incremente `token_version`; usará el JWT nuevo devuelto por
  `change-password`, sin realizar un segundo login.
- El handshake de Socket.IO en `backend/index.js` reutiliza la validación de `tv` de
  `backend/src/middleware/auth.js` cuando sea compartible y consulta además el
  marcador persistido. Un usuario pendiente recibe el formato actual de rechazo con
  `data.code = 'PASSWORD_CHANGE_REQUIRED'`; `connect_error` desactiva reconexión,
  conserva el token y redirige al cambio de contraseña.
- El formulario y la respuesta no permitirán que el solicitante elija la contraseña
  ni el rol del usuario inicial: siempre será `admin`.
- Esta feature implementa y amplía RF14, RF16, RF17, RF20, RI01, RI06, RI08, RNF01,
  RNF05, RNF07, RNF08, RNF09 y RNF19 de `docs/requisitos.md`; la creación global de
  clientes y el cambio obligatorio inicial son extensiones explícitas del modelo
  actual.
