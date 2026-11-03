# Feature Specification: Spike de Mosquitto Dynamic Security

**Feature Branch**: `013-enrolamiento-dynamic-security`

**Created**: 2026-11-02

**Status**: Draft — spike con criterio de corte 2026-11-06

**Input**: User description: "Spike de Mosquitto dynamic-security para EcoTrack. Habilitar el plugin dynamic-security en mosquitto.conf (TLS 8883), con un usuario admin propio del backend. Desde el backend Node.js, por el topic $CONTROL/dynamic-security/v1, crear un cliente MQTT con usuario/clave y un rol con ACL limitada a los topics de su dispositivo, y comprobar que con esas credenciales el equipo publica en su topic y NO puede publicar ni suscribirse al de otro dispositivo. Tener en cuenta la convivencia con passwd/acl estáticos y proponer la migración mínima. Entregable: script reproducible, cambios de docker-compose y mosquitto.conf, y un resultado Aprobado/Fallido con evidencia real. Si el 6/11 no funciona de punta a punta, revertir y documentar como mejora futura (8.2)."

**Requisitos relacionados**: RF03, RF04, RF12, RF18, RI14, RI15, RNF02, RNF06, RNF13, RNF15, RNF16.

## User Scenarios & Testing

### User Story 1 - Provisionar una identidad MQTT por dispositivo (Priority: P1)

Como responsable de fabricación y operación, necesito dar de alta un usuario MQTT
individual para cada dispositivo y limitarlo a sus propios topics, para que una
credencial comprometida no habilite acceso a otro equipo.

**Why this priority**: El aislamiento por dispositivo es el objetivo central del
spike y es necesario para cumplir el canal autenticado y las ACL de RNF02 y RNF16.

**Independent Test**: Ejecutar el script reproducible contra un broker de prueba,
crear un cliente y un rol mediante el canal de administración, y probar publicación
y suscripción con dos identidades distintas usando TLS.

**Acceptance Scenarios**:

1. **Given** un broker TLS iniciado con dynamic-security y el usuario administrativo
   del backend configurado, **When** el script solicita el alta de un dispositivo,
   **Then** se crea un cliente con usuario y clave generados fuera del repositorio,
   un rol asociado y reglas limitadas a `ecotrack/<deviceId>/lecturas`.
2. **Given** dos dispositivos con credenciales distintas, **When** el dispositivo A
   publica en `ecotrack/A/lecturas`, **Then** la publicación es aceptada, y cuando
   intenta publicar o suscribirse a `ecotrack/B/lecturas`, **Then** la operación es
   rechazada.
3. **Given** una prueba de aislamiento fallida o inconclusa, **When** se registra el
   resultado, **Then** el entregable queda `Fallido` y no se declara cumplimiento.

### User Story 2 - Mantener operativa la administración existente durante la migración (Priority: P1)

Como operador del sistema, necesito que el usuario del backend y las identidades
estáticas existentes sigan funcionando durante el spike, o que la migración mínima
indique explícitamente cómo se reemplazan, para no interrumpir la ingesta vigente.

**Why this priority**: La configuración actual combina `password_file` y `acl_file`;
un cambio de autenticación sin transición puede dejar al backend o a dispositivos
desplegados sin servicio.

**Independent Test**: Levantar el entorno desde cero, verificar el acceso TLS del
backend con su usuario administrativo y comprobar por separado el comportamiento
de una identidad estática existente y de una identidad dinámica nueva.

**Acceptance Scenarios**:

1. **Given** `passwd` y `acl.conf` contienen usuarios estáticos existentes, **When**
   se habilita dynamic-security, **Then** la configuración documenta si ambos
   mecanismos conviven soportados o si se migra cada identidad, sin duplicar ni
   sobrescribir silenciosamente permisos.
2. **Given** el backend necesita administrar clientes dinámicos, **When** publica
   comandos en `$CONTROL/dynamic-security/v1`, **Then** usa únicamente su identidad
   administrativa y no expone su secreto en logs, etiquetas ni archivos versionados.
3. **Given** el plugin o el canal de administración no está disponible, **When** se
   intenta provisionar, **Then** el script informa un error explícito y no presenta
   el dispositivo como dado de alta.

### User Story 3 - Decidir el destino del spike con evidencia reproducible (Priority: P1)

Como responsable del cierre técnico, necesito un resultado `Aprobado` o `Fallido`
basado en evidencia real antes del 2026-11-06, para decidir si se conserva la
integración o se revierte y se registra como mejora futura 8.2.

**Why this priority**: El spike tiene un criterio de corte temporal y no debe
convertirse en una afirmación de seguridad sin una prueba punta a punta.

**Independent Test**: Repetir el procedimiento documentado en un entorno limpio,
conservar logs y comandos sanitizados, y verificar que el resultado coincide con las
reglas de aceptación.

**Acceptance Scenarios**:

1. **Given** que TLS, alta dinámica, publicación propia y denegaciones cruzadas
   pasan con evidencia adjunta, **When** se consolida el resultado, **Then** se
   marca `Aprobado` con fecha, entorno, versiones y evidencias.
2. **Given** que cualquier paso punta a punta falla antes del 2026-11-06, **When**
   se alcanza el criterio de corte, **Then** se revierten los cambios operativos del
   spike y se documenta dynamic-security como mejora futura 8.2.
3. **Given** que no se ejecutó la prueba física o de integración requerida, **When**
   se redacta el resultado, **Then** se marca `Pendiente` y no se inventa `Aprobado`
   ni `Fallido`.

## Edge Cases

- El broker ya tiene clientes o roles dynamic-security persistidos; el script debe
  ser idempotente o detenerse con un diagnóstico claro, sin rotar secretos sin orden.
- El `deviceId` contiene caracteres no válidos para un topic o para un nombre de
  cliente; el alta debe rechazarse antes de enviar comandos administrativos.
- Se solicita el alta dos veces para el mismo dispositivo; no deben quedar dos
  identidades activas con permisos ambiguos.
- El usuario dinámico intenta suscribirse a un comodín que incluya otro dispositivo;
  la ACL debe denegarlo.
- El usuario administrativo intenta publicar lecturas o usar una identidad de
  dispositivo; sus permisos deben quedar separados.
- El archivo de persistencia del plugin no existe, no es escribible o se pierde al
  recrear el contenedor; el procedimiento debe detectarlo y documentar la recuperación.
- La configuración conserva `passwd`/`acl.conf` y el mismo nombre de usuario aparece
  en ambos mecanismos; debe existir una regla de precedencia o una migración explícita.
- Se ejecuta el script con un secreto faltante, inválido o expuesto en argumentos;
  debe fallar sin imprimirlo.
- La conexión TLS no valida la CA del broker; no se permite continuar con una conexión
  insegura ni con un resultado de seguridad positivo.

## Requirements

### Functional Requirements

- **FR-001**: El broker MUST conservar el listener TLS en el puerto 8883 y MUST
  validar la identidad del cliente según el mecanismo de autenticación configurado;
  no se permite degradar a una conexión insegura para administrar el plugin.
- **FR-002**: El entorno MUST habilitar dynamic-security con una configuración
  reproducible y una persistencia explícita de su estado, sin incluir secretos de
  producción en el repositorio.
- **FR-003**: El backend MUST disponer de un usuario administrativo propio para
  publicar comandos en `$CONTROL/dynamic-security/v1`; su credencial MUST provenir
  de configuración local segura y no de código, logs, etiquetas ni commits.
- **FR-004**: El script de provisioning MUST aceptar un export o registro de fábrica
  como entrada, validar el `deviceId`, generar o recibir una credencial MQTT por
  dispositivo sin imprimirla en claro, y ejecutar el alta de cliente y rol de forma
  reproducible.
- **FR-005**: El alta MUST asociar cada cliente a un rol que permita publicar y,
  cuando el contrato lo requiera, suscribirse únicamente a los topics del dispositivo
  correspondiente; no MUST conceder comodines que alcancen a otro dispositivo.
- **FR-006**: El script MUST soportar la baja de un dispositivo y dejar evidencia
  auditable de la operación sin revelar la credencial retirada.
- **FR-007**: El backend y el firmware MUST conservar el contrato existente de
  lecturas en `ecotrack/<deviceId>/lecturas`; este spike no cambia payloads ni topics.
- **FR-008**: Las credenciales estáticas de `passwd`/`acl.conf` y el usuario
  administrativo MUST tener una estrategia de convivencia o migración mínima
  documentada, incluyendo precedencia, usuarios afectados, reversión y ausencia de
  permisos ampliados por duplicación.
- **FR-009**: El script MUST detectar y reportar fallos de autenticación, autorización,
  TLS, persistencia o respuesta administrativa; no MUST devolver éxito-shaped fallback.
- **FR-010**: La prueba MUST verificar con dos dispositivos que el propietario puede
  publicar en su topic y que no puede publicar ni suscribirse al topic de otro
  dispositivo.
- **FR-011**: La evidencia MUST incluir comandos reproducibles, configuración efectiva,
  identificadores no secretos, logs sanitizados y resultados separados para cada
  intento permitido o rechazado; no MUST afirmar resultados no ejecutados.
- **FR-012**: El resultado del spike MUST clasificarse como `Aprobado`, `Fallido` o
  `Pendiente` según la evidencia real; únicamente `Aprobado` habilita conservar la
  integración como camino operativo.
- **FR-013**: Si la prueba punta a punta no funciona al 2026-11-06, MUST revertirse
  la habilitación operativa del plugin y MUST documentarse la integración como mejora
  futura 8.2, preservando la configuración estable anterior.
- **FR-014**: El alcance MUST excluir enrolamiento automático, rotación automática de
  credenciales, gestión desde el portal WiFi y reemplazo inmediato de todas las
  identidades estáticas desplegadas.

### Key Entities

- **Cliente MQTT de dispositivo**: identidad individual con usuario, secreto y estado
  de alta/baja; su secreto se obtiene del registro de fábrica y no se versiona.
- **Rol dynamic-security**: conjunto nombrado de permisos limitado al namespace del
  dispositivo, con reglas diferenciadas de publicación y suscripción.
- **Usuario administrativo del backend**: identidad separada que solo administra el
  canal de control requerido por el plugin.
- **Export de fábrica**: registro externo al repositorio que relaciona un dispositivo
  con su identidad y permite provisionarlo sin copiar secretos al código fuente.
- **Evidencia del spike**: configuración, logs sanitizados y resultados de pruebas que
  permiten clasificar el resultado sin inferencias.

## Success Criteria

### Measurable Outcomes

- **SC-001**: En un entorno limpio, 100% de las ejecuciones documentadas del script
  de alta crean o detectan exactamente un cliente y un rol para el dispositivo
  solicitado, sin secretos en el repositorio ni en la salida sanitizada.
- **SC-002**: Dos dispositivos de prueba pueden publicar 2/2 en su propio topic y
  obtienen rechazo en 4/4 intentos cruzados mínimos: publicar y suscribirse al topic
  del otro dispositivo, en ambos sentidos.
- **SC-003**: El backend puede ejecutar el alta y la baja mediante TLS validado
  contra la CA configurada, sin `setInsecure` ni equivalente, y cada fallo de
  autorización produce un diagnóstico verificable.
- **SC-004**: La estrategia de convivencia documenta el tratamiento de 100% de los
  usuarios presentes en `passwd`/`acl.conf` y permite volver a la configuración
  estable sin dejar permisos más amplios.
- **SC-005**: Antes del 2026-11-06 existe una clasificación basada en evidencia real:
  `Aprobado` solo si pasan todas las pruebas punta a punta; en otro caso,
  `Fallido` o `Pendiente`, sin resultados inventados.
- **SC-006**: Si el resultado es `Fallido` al corte, los cambios operativos del spike
  quedan revertidos y la mejora futura 8.2 queda documentada con la evidencia de la
  causa y los pasos faltantes.

## Assumptions

- El broker seguirá usando TLS 8883 y la CA existente seguirá siendo la autoridad de
  validación para clientes autorizados.
- El backend ya cuenta con un cliente MQTT y puede incorporar un segundo cliente
  administrativo sin modificar el contrato de ingesta.
- El estado dynamic-security se conservará en un volumen de Mosquitto y el secreto
  administrativo se inyectará desde configuración local no versionada.
- La migración mínima preferida mantiene las identidades estáticas durante el spike
  hasta demostrar convivencia segura; retirar o migrar dispositivos existentes es
  una decisión posterior.
- La prueba de criterio requiere un broker y dos identidades de dispositivo
  controladas; la aceptación física final solo se declara si se ejecuta realmente.
- El enrolamiento automático mencionado como mejora futura 8.2 permanece fuera de
  alcance, aunque este spike explore el canal administrativo que podría habilitarlo.
