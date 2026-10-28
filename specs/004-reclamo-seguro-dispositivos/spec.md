# Feature Specification: Reclamo seguro y aprovisionamiento de dispositivos

**Feature Branch**: `004-reclamo-seguro-dispositivos`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Un dispositivo sin dueño solo puede ser reclamado por un administrador que presente un token de reclamo único, aleatorio y de un solo uso; conocer el código del dispositivo no alcanza (RF21, RNF17). Al reclamar, el dispositivo queda asociado al cliente del admin y se registra la fecha del reclamo (reclamado_en). Un dispositivo dado de baja vuelve a quedar sin dueño, inactivo, sin nombre ni ubicación, sin umbrales, y puede ser reclamado de nuevo con un token nuevo. Las lecturas y alertas históricas conservan el cliente anterior (RNF18). Mientras un dispositivo no tiene dueño, sus mensajes se descartan. El token nunca se guarda en texto plano. Debe existir una forma de crear dispositivos nuevos sin dueño con su token (aprovisionamiento). Un reclamo con token inválido o ya usado se rechaza y no cambia al dueño."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aprovisionar un dispositivo sin dueño (Priority: P1)

Como operador autorizado, quiero crear un dispositivo sin dueño y obtener una credencial inicial de reclamo para entregarla de forma segura al administrador que lo instalará, sin asociarlo prematuramente a un cliente. El token se imprime una sola vez y puede rotarse explícitamente mientras el dispositivo siga sin dueño.

**Why this priority**: Es el punto de entrada necesario para que un dispositivo pueda incorporarse al sistema sin confiar únicamente en un código público o predecible.

**Independent Test**: Crear un dispositivo nuevo, verificar que no tiene dueño ni configuración activa y comprobar que el token entregado permite un reclamo válido sin quedar almacenado en texto plano.

**Acceptance Scenarios**:

1. **Given** un operador autorizado solicita un dispositivo nuevo, **When** se completa el aprovisionamiento, **Then** se crea sin cliente, inactivo, sin nombre, ubicación ni umbrales, y se imprime un token de reclamo único una sola vez.
2. **Given** un dispositivo aprovisionado, **When** alguien conoce solamente su código, **Then** no puede reclamarlo ni asociarlo a un cliente.
3. **Given** un dispositivo sin dueño, **When** el operador ejecuta `--rotate`, **Then** se reemplaza el hash anterior por el de un token nuevo y el token anterior deja de ser válido.
4. **Given** un código ya existente, **When** se ejecuta el aprovisionamiento sin `--rotate`, **Then** la operación se rechaza sin modificar el dispositivo ni sus tokens.

---

### User Story 2 - Reclamar un dispositivo con una credencial válida (Priority: P1)

Como administrador de un cliente, quiero reclamar un dispositivo sin dueño usando un token de un solo uso, para asociarlo a mi cliente y comenzar a configurarlo con trazabilidad del momento exacto del reclamo.

**Why this priority**: El reclamo es la barrera de autorización que impide que conocer o adivinar el identificador físico transfiera la propiedad del dispositivo.

**Independent Test**: Intentar el reclamo con un administrador y un token válido, y luego repetirlo con el mismo token, con un token inválido y con un usuario no administrador.

**Acceptance Scenarios**:

1. **Given** un dispositivo sin dueño y un token vigente no utilizado, **When** un administrador lo presenta, **Then** el dispositivo queda asociado al cliente del administrador, activo, y `reclamado_en` registra la fecha y hora del reclamo.
2. **Given** un dispositivo sin dueño, **When** un usuario común intenta reclamarlo aunque tenga un token válido, **Then** la operación se rechaza y el dispositivo permanece sin dueño.
3. **Given** un dispositivo sin dueño, **When** se presenta un token inválido o ya utilizado, **Then** la operación se rechaza y no cambia el dueño, el estado ni la fecha de reclamo.

---

### User Story 3 - Dar de baja y volver a reclamar un dispositivo (Priority: P1)

Como administrador, quiero dar de baja un dispositivo para devolverlo al estado sin dueño y permitir que un operador lo habilite de nuevo sin heredar la configuración ni exponer el historial del cliente anterior.

**Why this priority**: Los dispositivos pueden reutilizarse o cambiar de cliente; liberar su estado activo sin transferir configuración protege a ambos clientes y habilita el reacondicionamiento.

**Independent Test**: Reclamar un dispositivo, configurar nombre, ubicación y umbrales, registrar lecturas y alertas, darlo de baja y verificar el estado liberado sin token válido, el descarte de mensajes durante ese período, rotarlo con `--rotate` y reclamarlo con el nuevo token.

**Acceptance Scenarios**:

1. **Given** un dispositivo reclamado con configuración activa, **When** un administrador lo da de baja, **Then** queda sin dueño e inactivo, sin nombre, ubicación ni umbrales y sin token válido (`token_reclamo_hash = NULL`).
2. **Given** un dispositivo liberado con historial del cliente anterior, **When** un operador ejecuta `--rotate` y luego un administrador de otro cliente lo reclama con el token nuevo, **Then** el nuevo cliente solo obtiene datos generados desde ese nuevo reclamo y el cliente anterior conserva su histórico.
3. **Given** un dispositivo sin dueño, **When** llega un mensaje de lectura, **Then** el mensaje se descarta y no genera lectura, alerta, evento en tiempo real ni dato consultable posteriormente.

---

### Edge Cases

- Un token de reclamo se presenta dos veces, incluso si el primer reclamo fue exitoso: el segundo intento se rechaza sin modificar la asociación.
- Dos administradores intentan reclamar simultáneamente el mismo dispositivo con el mismo token: solo una operación puede tener éxito y la otra se rechaza sin cambiar el resultado confirmado.
- Se intenta reclamar un dispositivo que ya tiene dueño: la operación se rechaza aunque el token presentado sea válido para un ciclo anterior.
- Se pierde la respuesta de aprovisionamiento después de crear el dispositivo: no se debe emitir un segundo token válido para el mismo ciclo sin invalidar el anterior.
- El dispositivo se da de baja sin lecturas, alertas o umbrales: igualmente debe quedar completamente liberado y sin token válido hasta una rotación explícita del operador.
- `--rotate` se ejecuta sobre un dispositivo con dueño: la operación se rechaza sin modificar el dueño, la configuración ni el token vigente.
- Se intenta inferir o consultar el token almacenado: solo debe existir una representación no reversible del token, nunca el valor utilizable en texto plano.
- Un dispositivo transferido varias veces debe conservar para cada cliente únicamente las lecturas y alertas generadas durante su período de pertenencia.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir que `scripts/provision-device.js <codigo>` cree un dispositivo nuevo sin dueño, inactivo, sin nombre, ubicación ni umbrales, genere un token único y aleatorio, y lo imprima una sola vez. Si el código ya existe, DEBE rechazar la operación sin modificar nada. (RF21, RNF17)
- **FR-002**: El sistema DEBE permitir que `scripts/provision-device.js --rotate <codigo>` reemplace el hash del token únicamente cuando el dispositivo existe y no tiene dueño; el token anterior deja de ser válido y nunca debe haber más de un token válido.
- **FR-003**: El sistema DEBE permitir reclamar un dispositivo únicamente a un usuario autenticado con rol administrador y asociarlo al `cliente_id` de ese administrador, nunca a un cliente indicado por la solicitud. (RF17, RF18, RF21, RNF17)
- **FR-004**: El sistema DEBE exigir el token de reclamo además del código del dispositivo; conocer el código por sí solo NO DEBE permitir reclamarlo. (RF21, RNF17)
- **FR-005**: El sistema DEBE rechazar con estado HTTP `409` los reclamos con código inexistente, dueño existente, token inválido, token ausente o token ya usado, sin modificar dueño, estado, configuración ni `reclamado_en`. (RNF17)
- **FR-006**: El sistema DEBE invalidar atómicamente el token al aceptar un reclamo, de modo que como máximo un reclamo pueda tener éxito por token y dispositivo.
- **FR-007**: El sistema NO DEBE almacenar el token de reclamo en texto plano; debe conservar únicamente una representación no reversible suficiente para validar una presentación posterior. (RNF17)
- **FR-008**: Al aceptar un reclamo, el sistema DEBE asociar el dispositivo al cliente del administrador, activarlo y registrar la fecha y hora en `reclamado_en`.
- **FR-009**: El sistema DEBE restringir el aprovisionamiento, el reclamo y la baja a las funciones administrativas autorizadas, registrar las operaciones sensibles para auditoría y no revelar secretos en errores o respuestas innecesarias. (RNF17)
- **FR-010**: Al dar de baja un dispositivo, el sistema DEBE quitar su dueño, marcarlo inactivo, borrar nombre, ubicación y umbrales, y establecer `token_reclamo_hash = NULL`; solo `--rotate` puede habilitar un nuevo reclamo.
- **FR-011**: Las lecturas y alertas generadas durante la pertenencia de un cliente DEBEN conservar ese cliente aunque el dispositivo sea dado de baja o reclamado posteriormente. (RNF18)
- **FR-012**: Mientras un dispositivo no tenga dueño, el sistema DEBE descartar sus mensajes sin persistir lecturas, crear alertas, emitir eventos en tiempo real ni hacerlos disponibles mediante consultas.
- **FR-013**: Un dispositivo que ya tiene dueño DEBE rechazar cualquier intento de reclamo y conservar sin cambios su asociación y configuración.
- **FR-014**: Las respuestas y errores del reclamo DEBEN usar el mismo estado HTTP `409` para código inexistente, dueño existente, token inválido y token ya usado, sin exponer el token almacenado ni permitir inferir el historial de propietarios.
- **FR-015**: La interfaz existente de alta en `frontend/index.html` DEBE incluir un campo "token de reclamo", enviar `token` junto con `codigo`, `nombre` y `ubicacion` en `POST /api/dispositivos`, y mostrar un mensaje genérico cuando el reclamo sea rechazado. No se incluye rediseño visual.
- **FR-016**: La migración DEBE dejar sin token y sin modificaciones a los dispositivos existentes que ya tienen dueño; no debe generarles tokens automáticamente.

### Key Entities

- **Dispositivo**: Equipo identificable por un código, con dueño opcional, estado activo, nombre, ubicación y fecha `reclamado_en`; puede atravesar varios ciclos de aprovisionamiento, reclamo y baja.
- **Token de reclamo**: Secreto aleatorio asociado a un único ciclo de un dispositivo; se entrega al aprovisionar, se valida mediante una representación no reversible y queda inutilizable tras el primer reclamo o la baja.
- **Cliente**: Organización a la que pertenece el administrador que reclama el dispositivo y que delimita el acceso a los datos nuevos.
- **Lectura y alerta histórica**: Datos generados durante un ciclo de pertenencia, vinculados permanentemente al cliente que era dueño en ese momento.
- **Ciclo de pertenencia**: Período entre un reclamo aceptado y la baja posterior; define qué cliente recibe las nuevas lecturas y alertas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los reclamos con código correcto pero token ausente, inválido o ya utilizado son rechazados sin cambio de dueño ni configuración.
- **SC-002**: El 100% de los reclamos aceptados registra el cliente del administrador autenticado y una fecha `reclamado_en` no posterior al momento de confirmación.
- **SC-003**: En pruebas de transferencia, el 100% de las lecturas y alertas históricas permanece visible para su cliente de origen y el 0% aparece para el cliente posterior.
- **SC-004**: El 100% de los mensajes recibidos mientras el dispositivo está sin dueño queda descartado sin lectura, alerta, evento ni resultado histórico recuperable.
- **SC-005**: En pruebas de baja y reprovisionamiento, el 100% de los dispositivos queda sin dueño, inactivo, sin configuración heredada y sin token válido hasta una rotación explícita del operador.
- **SC-006**: En pruebas de rechazo, el 100% de los casos de código inexistente, dueño existente, token inválido y token ya usado responde HTTP `409` con el mismo formato genérico y sin cambios persistidos.
- **SC-007**: Los administradores pueden completar un reclamo válido desde el formulario existente con el campo de token, con una tasa de éxito de al menos 95% en una prueba con usuarios representativos.

## Assumptions

- El aprovisionamiento se realiza mediante el script operativo `scripts/provision-device.js`; el token se imprime una sola vez por un canal considerado seguro.
- El sistema de autenticación existente ya identifica el rol y `cliente_id` del administrador; esta funcionalidad no redefine usuarios ni clientes.
- La unicidad del token se exige dentro del sistema y durante toda su vida útil; la aleatoriedad debe impedir su adivinación práctica.
- La baja conserva lecturas y alertas históricas, pero elimina toda configuración operativa y todo token válido del dispositivo; el operador debe ejecutar `--rotate` para habilitar un nuevo ciclo.
- La fecha `reclamado_en` representa el inicio del ciclo de pertenencia vigente; el historial usa la pertenencia efectiva del ciclo en que se generó cada dato.
- La expiración temporal del token no se exige porque la solicitud solo establece uso único; si el producto adopta expiración posteriormente, un token expirado se tratará como inválido.
- La mensajería del dispositivo mantiene su formato y código existentes; esta funcionalidad cambia la autorización y el descarte, no el protocolo físico de captura.
- El alcance frontend se limita al formulario y manejo de error de `frontend/index.html` y `frontend/shared/app.js`; no incluye rediseño ni nuevas pantallas.
