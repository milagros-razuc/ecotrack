# Feature Specification: Reseteo de contraseña por administrador

**Feature Branch**: `024-reset-password-admin`

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "Reseteo de contraseña de usuarios por parte de un administrador en el dashboard de EcoTrack."

## Relación con requisitos y specs existentes

Esta feature amplía la gestión de usuarios de RF16 y RF17, el aislamiento de RF18,
la auditoría de RF14 y la autenticación de RF20/RI06/RI17. Reutiliza el contrato de
primer ingreso con cambio obligatorio definido en la Feature 021, sin incorporar
recuperación por correo ni cambio de contraseña desde el perfil.

## Fuera de alcance

- Recuperación por correo, SMS u otro canal desde la pantalla de login.
- Cambio de contraseña desde el perfil del usuario.
- Que un usuario resetee su propia contraseña mediante este flujo.
- Que un administrador elija o conozca la contraseña temporal.
- Mostrar, descargar, enviar o recuperar una contraseña temporal después de cerrar
  el resultado inicial.
- Resetear administradores del mismo nivel por parte de un administrador de cliente.
- Agregar un endpoint distinto para `platform_admin`; ambos roles usan el mismo
  endpoint y la matriz de permisos del servicio.

## User Scenarios & Testing

### User Story 1 - Resetear la contraseña de un usuario de la organización (Priority: P1)

Como administrador de una organización, quiero resetear la contraseña de un usuario
de mi organización para devolverle el acceso cuando la olvidó.

**Why this priority**: Resuelve el bloqueo de acceso sin intervención manual y
mantiene el control del administrador dentro de su organización.

**Independent Test**: Con un administrador y un usuario común de la misma
organización, confirmar un reset desde la lista de usuarios, copiar la contraseña
temporal, iniciar sesión con ella y completar el cambio obligatorio antes de abrir
el dashboard.

**Acceptance Scenarios**:

1. **Given** un administrador autenticado y un usuario activo de su organización,
   **When** confirma el reset, **Then** el sistema genera una contraseña temporal
   aleatoria, la muestra una sola vez con una acción de copiar, invalida las sesiones
   activas y registra la operación sin guardar la contraseña en texto plano.
2. **Given** una contraseña temporal vigente, **When** el usuario inicia sesión por
   primera vez, **Then** obtiene una sesión restringida y debe definir una contraseña
   nueva que cumpla la política antes de acceder al dashboard.
3. **Given** que el usuario completa el cambio, **When** intenta usar la contraseña
   temporal, **Then** esta deja de ser válida y la nueva contraseña permite el acceso
   normal.
4. **Given** el modal del resultado visible, **When** el administrador lo copia y
   cierra, **Then** el valor puede copiarse mientras está visible y no puede volver a
   mostrarse ni recuperarse desde el dashboard.

### User Story 2 - Restringir el reset por rol y organización (Priority: P1)

Como responsable de seguridad, quiero que cada reset respete la jerarquía de roles y
la organización del solicitante para impedir cambios entre clientes o sobre cuentas
protegidas.

**Why this priority**: Un error de autorización permitiría tomar control de cuentas
de otra organización o de administradores con privilegios equivalentes.

**Independent Test**: Intentar el mismo reset con un administrador de otra
organización, un administrador sobre otro administrador de cliente, un
`platform_admin` sobre un administrador de cliente y un usuario sobre sí mismo;
verificar que solo la operación permitida modifica el estado.

**Acceptance Scenarios**:

1. **Given** un administrador de cliente y un usuario de su organización que no es
   administrador, **When** confirma el reset, **Then** la operación es autorizada.
2. **Given** un administrador de cliente y un usuario de otra organización,
   **When** solicita el reset, **Then** recibe rechazo y no se modifica ninguna
   cuenta.
3. **Given** un administrador de cliente, **When** intenta resetear a otro
   administrador de cliente o a sí mismo, **Then** recibe rechazo y no se modifica
   ninguna cuenta.
4. **Given** un `platform_admin`, **When** resetea a un administrador o usuario
   común de cualquier cliente, **Then** la operación es autorizada y queda auditada
   usando el `cliente_id` del usuario objetivo.
5. **Given** un usuario inactivo o eliminado, **When** se solicita el reset, **Then**
   se rechaza sin emitir contraseña ni cambiar sesiones.
6. **Given** un `admin` en `usuarios.html`, **When** se lista la organización,
   **Then** el botón "Resetear contraseña" aparece únicamente para usuarios
   `comun` elegibles del mismo cliente.
7. **Given** un `platform_admin` en la solapa Clientes del panel de plataforma,
   **When** consulta un cliente, **Then** puede ver el listado de sus usuarios y el
   botón aparece para objetivos `admin` y `comun`, pero no para otro
   `platform_admin` ni para sí mismo.

### User Story 3 - Recuperar el acceso de forma segura y auditable (Priority: P1)

Como responsable de la plataforma, quiero que las contraseñas temporales sean
limitadas, expiren y queden auditadas para reducir el impacto de una entrega
indebida.

**Why this priority**: El flujo entrega una credencial por un canal externo y debe
limitar su exposición y permitir investigar quién realizó la acción.

**Independent Test**: Crear un reset pendiente, superar el vencimiento o el límite
de intentos, emitir un segundo reset y consultar la auditoría con el actor, objetivo,
fecha, resultado e IP, sin secretos.

**Acceptance Scenarios**:

1. **Given** una contraseña temporal no utilizada durante 24 horas, **When** el
   usuario intenta iniciar sesión, **Then** la credencial es rechazada y debe
   solicitarse otro reset administrativo.
2. **Given** demasiados intentos fallidos con una contraseña temporal, **When** se
   alcanza el límite configurado para esa emisión, **Then** la credencial queda
   invalidada y los intentos posteriores son rechazados.
3. **Given** un usuario con un reset pendiente, **When** un administrador autorizado
   genera otro reset, **Then** la contraseña anterior queda invalidada de inmediato y
   solo la nueva puede iniciar el flujo de primer ingreso.
4. **Given** un reset confirmado, **When** se consulta la auditoría, **Then** consta
   quién reseteó a quién, cuándo, desde qué IP y el resultado, sin contraseña,
   hash, token ni datos equivalentes.
5. **Given** que el administrador pierde la contraseña antes de copiarla, **When**
   solicita generar otra, **Then** la anterior queda invalidada y se muestra una nueva
   contraseña temporal una sola vez.

### Edge Cases

- La solicitud apunta a un usuario inexistente, eliminado o inactivo: debe rechazarse
  sin revelar información adicional ni efectos laterales.
- El objetivo es el propio solicitante o un rol no permitido: debe rechazarse antes
  de crear una credencial.
- El usuario cambia la contraseña temporal y existen sesiones anteriores: todas las
  sesiones previas permanecen invalidadas.
- La confirmación explícita se cancela o se cierra: no se genera contraseña ni se
  registra un reset exitoso.
- Se repite una solicitud con un reset pendiente: la emisión nueva invalida por
  completo la emisión anterior.
- La contraseña nueva es demasiado corta, coincide con la temporal o pertenece a la
  lista de contraseñas comunes: el cambio se rechaza y la sesión restringida continúa.
- El acceso temporal falla por credencial vencida o por límite de intentos: el mensaje
  no debe revelar secretos ni permitir distinguir estados internos innecesarios.

## Requirements

### Functional Requirements

- **FR-001**: El dashboard MUST ofrecer una acción de reset en la lista de usuarios
  solo después de una confirmación explícita del administrador.
- **FR-002**: El backend MUST autorizar el reset usando la identidad, rol y
  `cliente_id` de la sesión; nunca debe aceptar la organización del objetivo desde el
  cuerpo o la interfaz como fuente de autorización.
- **FR-003**: El endpoint MUST permitir el acceso a los roles `admin` y
  `platform_admin`; la matriz efectiva MUST evaluarse en el servicio.
- **FR-004**: Un `admin` MUST poder resetear únicamente usuarios activos con rol
  `comun` y el mismo `cliente_id` del JWT.
- **FR-005**: Un `platform_admin` MUST poder resetear usuarios activos con rol
  `admin` o `comun` de cualquier cliente.
- **FR-006**: Nadie MUST poder resetear a un usuario de su mismo rol, de rol superior
  ni a sí mismo; esos casos responden 403.
- **FR-007**: Si el objetivo no existe, o es de otro cliente cuando el solicitante es
  `admin`, el endpoint MUST responder 404 genérico sin revelar su existencia.
- **FR-008**: La matriz MUST implementarse en una única función pura
  `puedeResetear(solicitante, objetivo)` para poder probarla de forma aislada.
- **FR-009**: Tras la confirmación autorizada, el sistema MUST generar una contraseña
  temporal aleatoria, persistir únicamente su representación no reversible y mostrar
  el valor en la respuesta del resultado una sola vez.
- **FR-010**: La interfaz MUST permitir copiar la contraseña temporal solo mientras
  el resultado está visible y MUST eliminarla al cerrar o abandonar el resultado.
- **FR-011**: La contraseña temporal MUST vencer 24 horas después de su emisión, quedar
  invalidada después del cambio de contraseña y admitir como máximo 5 intentos
  fallidos por emisión antes de invalidarse.
- **FR-012**: Cada nueva emisión para el mismo usuario MUST invalidar cualquier
  emisión temporal pendiente anterior.
- **FR-013**: El primer login con una contraseña temporal válida MUST crear una sesión
  restringida al cambio de contraseña y MUST bloquear el acceso al dashboard hasta
  completarlo.
- **FR-014**: La contraseña nueva MUST tener al menos 8 caracteres, no ser igual a
  la temporal y ser rechazada si pertenece a la lista vigente de contraseñas comunes.
- **FR-015**: Un reset o cambio de contraseña temporal MUST invalidar todas las
  sesiones activas del usuario, incluidas las emitidas antes del reset.
- **FR-016**: El sistema MUST registrar en auditoría el `cliente_id` del usuario
  objetivo, además del actor, usuario objetivo,
  fecha y hora, IP de origen y resultado del reset; el registro MUST excluir
  contraseña, hash, token y cualquier secreto.
- **FR-017**: Las respuestas de errores de autorización, inexistencia, inactividad,
  vencimiento y límite de intentos MUST ser sanitizadas y no revelar secretos ni
  permitir operar sobre otra organización.
- **FR-018**: La operación MUST ser atómica respecto del usuario: si no puede
  invalidar la emisión anterior, sesiones activas o persistencia necesaria, no debe
  entregar una nueva contraseña ni informar éxito.
- **FR-019**: El flujo MUST incluir pruebas de servicio o ruta para autorización,
  aislamiento entre clientes, entrega única, expiración, límite de intentos,
  invalidación de sesiones, política de contraseña, auditoría y repetición de reset.
- **FR-020**: En `usuarios.html`, un `admin` MUST ver el botón "Resetear contraseña"
  solo sobre usuarios `comun` elegibles; un `platform_admin` MUST verlo sobre
  usuarios `admin` y `comun` elegibles.
- **FR-021**: El panel de plataforma MUST ofrecer la acción desde la solapa
  **Clientes**, mostrando el listado de usuarios agrupado o filtrado por cliente,
  y debe ocultarla para objetivos no permitidos sin sustituir la autorización backend.

### Contratos funcionales

- **Listado de usuarios**: la acción de reset solo aparece para objetivos elegibles
  según el rol del actor; la interfaz no debe inferir permisos sin que el backend los
  haga cumplir.
- **Panel de plataforma**: la solapa **Clientes** permite seleccionar un cliente y
  consultar sus usuarios; la acción usa el mismo endpoint y respuesta que
  `usuarios.html`.
- **Resultado de reset**: una respuesta exitosa contiene únicamente la identidad
  no sensible del objetivo, la contraseña temporal para entrega inmediata y su
  vencimiento; nunca contiene hash ni permite consultar nuevamente el valor.
- **Primer ingreso**: una autenticación temporal válida devuelve una sesión marcada
  como cambio obligatorio y solo permite el endpoint de cambio y la consulta mínima
  de identidad necesaria para completar el flujo.
- **Auditoría**: el evento distingue actor, objetivo, organización, timestamp, IP y
  resultado, sin incluir el valor temporal, su hash ni la contraseña nueva.

### Key Entities

- **Emisión de contraseña temporal**: credencial de un solo uso asociada a un usuario,
  con hash, emisión, vencimiento, intentos restantes y estado invalidado.
- **Usuario**: cuenta con organización, rol y estado activo/inactivo que determina si
  puede ser objetivo.
- **Sesión de usuario**: acceso activo que debe invalidarse al resetear o cambiar la
  contraseña.
- **Evento de auditoría**: registro inmutable del actor, objetivo, momento, IP,
  organización y resultado de la operación.

## Success Criteria

### Measurable Outcomes

- **SC-001**: En una prueba de uso, un administrador puede completar el reset,
  copiar la contraseña y recibir confirmación en menos de 1 minuto.
- **SC-002**: El 100% de los usuarios con una emisión temporal vigente puede iniciar
  el cambio obligatorio en el primer intento válido.
- **SC-003**: El 100% de las emisiones temporales vencidas, superadas en intentos,
  reemplazadas por otra emisión o ya utilizadas son rechazadas.
- **SC-004**: El 100% de las sesiones activas del usuario objetivo queda invalidado
  después de un reset confirmado.
- **SC-005**: El 100% de las operaciones revisadas contiene actor, objetivo, fecha,
  IP y resultado en auditoría, y no contiene secretos.
- **SC-006**: El 100% de los intentos de reset entre organizaciones o sobre roles no
  permitidos es rechazado sin modificar al usuario objetivo.
- **SC-007**: Al menos el 95% de administradores evaluados completa el flujo sin
  asistencia adicional y sin intentar recuperar una contraseña ya ocultada.

## Assumptions

- Se reutilizan la autenticación por token, la sesión restringida y el endpoint de
  cambio de contraseña ya establecidos por la Feature 021.
- La política vigente de contraseñas comunes se mantiene como una lista versionada
  por el backend; no se exige una fuente externa para esta feature.
- El límite de 5 intentos fallidos y el mínimo general de 8 caracteres son los
  valores iniciales de esta feature. Las cuentas privilegiadas (`admin` y
  `platform_admin`) mantienen un mínimo de 12 caracteres y las temporales se
  generan con un mínimo independiente de 12 caracteres.
- La IP se obtiene de la solicitud autenticada y se registra conforme al mecanismo
  de auditoría existente.
- El envío de la contraseña al usuario queda a cargo del administrador por un canal
  externo y no forma parte del sistema.
- El soporte móvil se limita al comportamiento responsive ya cubierto por el
  dashboard; no se crea una aplicación nativa.

## Plan de implementación requerido

1. Revisar y extender el modelo de usuarios, sesiones, emisión temporal y auditoría
   con migraciones repetibles y sin almacenar contraseñas en texto plano.
2. Implementar el servicio y la ruta protegida con autorización por rol y cliente,
   invalidación transaccional, expiración, intentos y auditoría.
3. Integrar la lista de usuarios, confirmación, modal de entrega única y copia.
4. Integrar el primer login restringido y la política de cambio de contraseña.
5. Añadir pruebas unitarias, de integración y de aislamiento multi-cliente, y actualizar
   la documentación de API y gestión de usuarios.
