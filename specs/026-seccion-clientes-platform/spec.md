# Feature Specification: Seccion Clientes de plataforma

**Feature Branch**: `026-seccion-clientes-platform`

**Created**: 2026-11-18

**Status**: Draft

**Input**: User description: "Sección «Clientes» en el panel de plataforma"

## Relación con requisitos y specs existentes

Esta feature amplía la gestión de usuarios de RF16 y RF17, el aislamiento de RF18,
la auditoría de RF14 y la autenticación de RI06/RI17. Reutiliza el reset seguro y
auditable definido en la Feature 024 y el listado existente de clientes y usuarios
por cliente. La pantalla nueva debe mantener el primer ingreso con cambio obligatorio
establecido por las funcionalidades previas.

## Fuera de alcance

- Crear, editar o eliminar clientes desde esta sección.
- Crear o administrar usuarios distintos de recuperar el acceso del administrador
  correspondiente mediante el reset ya existente.
- Recuperación de contraseña por correo, SMS o un canal distinto al de entrega
  directa por el administrador de plataforma.
- Mostrar nuevamente una contraseña temporal después de cerrar su resultado.
- Permitir que un usuario de cliente acceda a la pantalla o a sus operaciones,
  aunque conozca una URL directa o detecte una operación de la API.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consultar los clientes y su administrador (Priority: P1)

Como administrador de plataforma, quiero abrir una sección propia «Clientes» desde
el menú lateral y ver todos los clientes junto con la identidad de su administrador
para localizar rápidamente a quién puedo ayudar a recuperar el acceso.

**Why this priority**: Es el acceso principal solicitado y elimina la selección
implícita dentro de «Panel de plataforma».

**Independent Test**: Ingresar con una cuenta de plataforma y verificar el ítem
«Clientes», el listado completo, el nombre y username de cada administrador y el
estado visible para clientes sin administrador.

**Acceptance Scenarios**:

1. **Given** un administrador de plataforma autenticado, **When** abre el menú
   lateral, **Then** puede navegar a «Clientes» y la pantalla se carga con todos
   los clientes.
2. **Given** un cliente con exactamente un usuario administrador activo,
   **When** se muestra su fila, **Then** se presenta su nombre y username junto
   con una acción disponible para recuperar la contraseña.
3. **Given** un cliente sin ningún usuario administrador activo, **When** se
   muestra su fila, **Then** se indica claramente «Sin administrador» y no se
   ofrece reset.
4. **Given** un usuario con rol de cliente autenticado, **When** intenta abrir
   «Clientes» por URL directa o usar una operación de listado/reset, **Then** se
   le niega el acceso y no obtiene datos ni modifica cuentas.

---

### User Story 2 - Recuperar el acceso del administrador (Priority: P1)

Como administrador de plataforma, quiero iniciar el reset desde la fila del cliente
y recibir una contraseña temporal de una sola entrega para devolver el acceso al
administrador sin conocer ni elegir la contraseña.

**Why this priority**: Es el resultado operativo central y debe reutilizar los
controles de seguridad de la Feature 024.

**Independent Test**: Seleccionar un cliente elegible, confirmar el reset, copiar
la contraseña mostrada una sola vez y comprobar que el administrador debe cambiarla
en su próximo ingreso.

**Acceptance Scenarios**:

1. **Given** un cliente elegible con un administrador activo, **When** el
   administrador de plataforma confirma la acción, **Then** se genera una contraseña
   temporal aleatoria y se muestra una sola vez con opción de copiar.
2. **Given** el resultado temporal visible, **When** se confirma o copia y luego se
   cierra el diálogo, **Then** la contraseña desaparece y no puede volver a
   mostrarse ni recuperarse desde la pantalla.
3. **Given** una contraseña temporal recién emitida, **When** el administrador del
   cliente inicia sesión con ella, **Then** debe completar el cambio obligatorio
   antes de acceder al panel.
4. **Given** un reset confirmado, **When** se consulta la auditoría, **Then** se
   registra quién realizó la acción, a qué usuario, cuándo y el resultado sin
   guardar la contraseña temporal ni datos derivados reutilizables.

---

### User Story 3 - Resolver clientes con administración ambigua (Priority: P2)

Como administrador de plataforma, quiero distinguir claramente los casos sin
administrador y con varios administradores para no aplicar un reset a una cuenta
incorrecta.

**Why this priority**: Evita decisiones inseguras sobre cuentas privilegiadas y
reduce errores operativos.

**Independent Test**: Cargar clientes con cero, uno y varios administradores activos
y comprobar el texto, las acciones y el destinatario efectivo del reset en cada caso.

**Acceptance Scenarios**:

1. **Given** un cliente sin administrador activo, **When** se muestra su fila,
   **Then** no hay acción de reset y se presenta un estado inequívoco.
2. **Given** un cliente con varios usuarios con rol administrador activo,
   **When** se muestra su fila, **Then** se muestra el administrador más antiguo
   (el usuario con menor id) como administrador principal y se indica claramente
   cuántos administradores existen. El reset se aplica al administrador principal.
3. **Given** un cliente elegible con exactamente un administrador,
   **When** se inicia el reset, **Then** el objetivo queda identificado por nombre
   y username antes de confirmar.

### Requisitos visuales de la pantalla Clientes

- El listado MUST presentar las columnas Cliente, Administrador, Usuarios y Acciones.
- El administrador principal MUST mostrarse con iniciales, nombre destacado,
  username secundario y una etiqueta con la cantidad si existen varios.
- La acción de reset MUST ser un botón de ícono con tooltip y `aria-label`;
  «Ver usuarios» MUST estar junto a ella en Acciones.
- Al seleccionar «Ver usuarios», la fila MUST resaltarse y el panel de usuarios
  MUST desplazarse a la vista sin mostrar un selector separado.
- Los roles en Usuarios por cliente MUST mostrarse como etiquetas y el estado sin
  usuarios MUST ser visible. El diseño MUST conservar tarjetas, espaciado, hover
  y modo oscuro de la pantalla de plataforma, con foco visible en controles.

---

### Edge Cases

- Un cliente tiene administradores inactivos o eliminados: se considera sin
  administrador activo y no se ofrece reset.
- El administrador cambia o desaparece después de cargar el listado: la operación
  se vuelve a validar antes de emitir una contraseña y rechaza objetivos ya no
  elegibles.
- El cierre del diálogo ocurre antes de copiar: la contraseña temporal desaparece
  inmediatamente y solo puede emitirse un reset nuevo si corresponde.
- Se repite la operación: la emisión anterior queda invalidada y solo la nueva
  contraseña puede iniciar el cambio obligatorio, según el comportamiento de la
  Feature 024.
- El listado contiene muchos clientes: debe evitar consultas independientes por
  cada fila y seguir mostrando todos los resultados de forma utilizable.
- Un cliente con varios administradores no debe permitir inferir por nombre o
  posición cuál cuenta se modificó: el resultado debe identificar siempre al
  usuario objetivo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST mostrar un ítem «Clientes» en el menú lateral y
  el menú móvil visibles únicamente para usuarios con rol `platform_admin`.
- **FR-002**: La navegación directa a la pantalla «Clientes» MUST ser denegada
  para usuarios sin el rol `platform_admin`, con redirección segura o rechazo
  inequívoco.
- **FR-003**: La pantalla MUST mostrar todos los clientes y, para cada uno, su
  nombre y el nombre/username de su administrador activo cuando exista.
- **FR-004**: Para clientes sin administrador activo, la pantalla MUST mostrar
  claramente «Sin administrador» y MUST ocultar la acción de reset.
- **FR-005**: El listado MUST obtener la información necesaria sin ejecutar una
  consulta independiente por cliente para resolver su administrador.
- **FR-006**: Desde una fila elegible, el administrador de plataforma MUST poder
  iniciar el reset existente de contraseña del administrador del cliente con una
  confirmación que identifique al objetivo.
- **FR-007**: Solo el rol `platform_admin` MUST poder ejecutar el listado y el
  reset de esta sección; el backend MUST negar las mismas operaciones a
  administradores de cliente y usuarios comunes aunque conozcan la URL o llamen
  directamente a la API.
- **FR-008**: La operación MUST reutilizar las reglas de seguridad y el primer
  ingreso con cambio obligatorio de la Feature 024.
- **FR-009**: Tras una operación autorizada, la contraseña temporal MUST
  mostrarse una sola vez en un diálogo con opción de copiar.
- **FR-010**: Al cerrar el diálogo, o al abandonar la pantalla, la contraseña
  temporal MUST desaparecer de la vista y no MUST existir un mecanismo para
  recuperarla posteriormente.
- **FR-011**: La contraseña temporal MUST ser confidencial: no debe aparecer en
  el HTML persistente, en logs, en el historial del navegador ni en registros
  de auditoría.
- **FR-012**: Cada operación confirmada MUST registrar actor, usuario objetivo,
  cliente, fecha y hora y resultado en auditoría, sin secreto temporal ni
  contraseña derivada.
- **FR-013**: Si un cliente tiene varios administradores activos, el listado MUST
  mostrar el usuario con menor id como administrador principal, indicar la
  cantidad total de administradores y aplicar el reset únicamente a ese
  administrador principal. Como regla operativa normal, un cliente tiene un solo
  administrador y el resto de usuarios operativos deben aparecer con el rol
  correspondiente, no como administradores.
- **FR-014**: La sección nueva MUST concentrar el listado de usuarios por cliente
  actualmente ubicado en `plataforma.html`. El selector y la tabla «Usuarios por
  cliente» MUST retirarse del panel global para evitar duplicación y MUST seguir
  siendo reutilizados desde la pantalla «Clientes» como una vista asociada a cada
  fila o cliente seleccionado.
- **FR-015**: El listado, navegación y reset MUST seguir las validaciones visuales
  existentes de estados de carga, error y acceso denegado.

### Key Entities

- **Cliente**: organización gestionada por la plataforma, con nombre e identidad
  propia en el listado.
- **Administrador de cliente**: usuario activo con rol `admin` asociado al cliente;
  puede tener nombre y username mostrados en la fila.
- **Resultado de reset**: credencial temporal de entrega única asociada a un
  administrador objetivo y con estado controlado por la Feature 024.
- **Evento de auditoría**: registro de la acción realizada por el administrador de
  plataforma, incluyendo objetivo, cliente y momento.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En una prueba de uso, un administrador de plataforma puede localizar
  un cliente elegible e iniciar el reset completo en menos de 1 minuto.
- **SC-002**: El 100% de los clientes sin administrador activo se muestran con
  estado inequívoco y sin acción de reset.
- **SC-003**: El 100% de los intentos de abrir la sección o ejecutar su API desde
  roles distintos de `platform_admin` queda denegado.
- **SC-004**: La contraseña temporal se muestra exactamente una vez por emisión y
  desaparece al cerrar o abandonar el diálogo en el 100% de las pruebas.
- **SC-005**: El 100% de los resets confirmados revisados incluye actor, usuario
  objetivo, cliente, fecha/hora y resultado en auditoría, sin secreto temporal.
- **SC-006**: Un listado de 500 clientes puede cargarse y hacerse usable sin
  consultas independientes por fila ni una degradación perceptible superior a
  3 segundos en el entorno objetivo.
- **SC-007**: Al menos el 95% de los administradores de plataforma evaluados
  identifica el administrador de cada cliente y el estado sin administrador en el
  primer uso sin asistencia.

## Assumptions

- La Feature 024 sigue siendo la fuente de verdad para generación temporal,
  caducidad, intentos, invalidación de sesiones y cambio obligatorio.
- Un usuario administrador activo significa una cuenta de rol `admin`, asociada
  al cliente y actualmente disponible para iniciar sesión.
- La configuración normal de cada cliente contempla un único administrador;
  los usuarios operativos de la organización se representan con otro rol.
- El nombre y username mostrados provienen de los datos existentes del usuario y
  no requieren una edición desde esta pantalla.
- La entrega de la contraseña temporal sigue a cargo del administrador de plataforma
  por un canal externo seguro; EcoTrack no la envía por correo ni SMS.
- La nueva página usa el patrón de navegación responsive ya existente y conserva
  el panel `plataforma.html` para las demás operaciones globales hasta que se
  resuelva la decisión sobre «Usuarios por cliente».
