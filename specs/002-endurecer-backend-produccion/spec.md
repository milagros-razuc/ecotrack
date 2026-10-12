# Feature Specification: Endurecer backend para producción

**Feature Branch**: `002-endurecer-backend-produccion`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "Endurecer el backend para producción. Implementa RNF01, RNF03, RNF06. Respeta las reglas de Producción y configuración y de Usuarios de docs/requisitos.md. No cambia formatos de eventos ni de endpoints."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Arranque seguro según el entorno (Priority: P1)

Como responsable de despliegue, quiero que el backend no arranque con credenciales administrativas ausentes en producción y que no cree cuentas de prueba, para evitar accesos no autorizados.

**Why this priority**: Un arranque con credenciales predecibles puede exponer inmediatamente todos los datos y operaciones administrativas.

**Independent Test**: Ejecutar la inicialización con `NODE_ENV=production` sin `ADMIN_PASS` y comprobar que falla; ejecutarla con una contraseña válida y comprobar que no aparece ningún usuario de prueba. Ejecutar fuera de producción y comprobar que se mantienen los valores de desarrollo junto con una advertencia visible.

**Acceptance Scenarios**:

1. **Given** el entorno está configurado como producción y `ADMIN_PASS` no existe, **When** se inicia la migración, **Then** el proceso falla antes de completar el arranque y comunica que falta la credencial requerida.
2. **Given** el entorno está configurado como producción y `ADMIN_PASS` existe, **When** se inicializa la base, **Then** no se crea el usuario de prueba.
3. **Given** el entorno no es producción y faltan valores de despliegue, **When** se inicializa la base, **Then** se conservan los valores de desarrollo y se emite una advertencia en consola.

---

### User Story 2 - Datos y migraciones consistentes (Priority: P1)

Como responsable de operación, quiero que las migraciones se puedan repetir y que la base rechace roles y estados fuera del dominio permitido, para preservar la integridad de usuarios y alertas durante cada arranque.

**Why this priority**: Los arranques repetidos son normales en despliegues, y los valores inválidos comprometen autorización, auditoría y presentación de alertas.

**Independent Test**: Ejecutar la migración dos veces sobre la misma base y verificar que ambas ejecuciones terminan correctamente; intentar persistir un usuario con rol distinto de `admin` o `comun` y una alerta con estado distinto de `pendiente` o `atendida`, y verificar que la base los rechaza.

**Acceptance Scenarios**:

1. **Given** una base ya migrada, **When** se ejecuta nuevamente la migración, **Then** termina sin error ni duplicación de restricciones.
2. **Given** un intento de guardar un usuario con un rol no permitido, **When** la base valida la operación, **Then** la operación es rechazada.
3. **Given** un intento de guardar una alerta con un estado no permitido, **When** la base valida la operación, **Then** la operación es rechazada.
4. **Given** los registros actuales usan valores válidos, **When** se aplican las restricciones, **Then** los registros existentes continúan disponibles.

---

### User Story 3 - Protección de solicitudes y conexiones (Priority: P1)

Como usuario del dashboard y responsable de seguridad, quiero que las respuestas y conexiones solo acepten orígenes configurados, para reducir exposición desde sitios no autorizados sin romper el contrato existente de eventos o endpoints.

**Why this priority**: Un origen arbitrario puede consumir recursos y acceder a respuestas del backend desde una aplicación no autorizada.

**Independent Test**: Configurar una lista explícita de orígenes, realizar una solicitud REST y una conexión Socket.io desde un origen permitido y otra desde un origen no permitido; comprobar que solo el origen permitido recibe cabeceras CORS.

**Acceptance Scenarios**:

1. **Given** `CORS_ORIGIN` contiene uno o más orígenes permitidos, **When** una solicitud REST proviene de uno de ellos, **Then** recibe las cabeceras CORS correspondientes.
2. **Given** `CORS_ORIGIN` contiene uno o más orígenes permitidos, **When** una solicitud REST proviene de un origen no listado, **Then** no recibe cabeceras CORS de autorización.
3. **Given** `CORS_ORIGIN` contiene uno o más orígenes permitidos, **When** una conexión Socket.io proviene de uno de ellos, **Then** se acepta según la configuración.
4. **Given** una conexión Socket.io proviene de un origen no listado, **When** intenta establecerse, **Then** no recibe autorización CORS.
5. **Given** no se configuró `CORS_ORIGIN`, **When** se inicia el backend, **Then** solo se permite el origen local documentado por defecto.

---

### Edge Cases

- La lista de orígenes contiene espacios alrededor de una coma; cada origen debe interpretarse sin esos espacios.
- `CORS_ORIGIN` contiene un origen repetido; esto no debe ampliar permisos ni provocar un fallo de arranque.
- Se ejecuta la migración cuando una restricción equivalente ya existe; la operación debe ser segura y no duplicarla.
- Se intenta insertar un valor inválido directamente en la base, sin pasar por el backend; la restricción de la base debe rechazarlo.
- La configuración de producción usa una contraseña vacía; debe tratarse como credencial ausente.
- El cambio no debe alterar nombres, cargas ni semántica de los eventos en tiempo real ni formatos de endpoints existentes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST exigir una contraseña administrativa configurada cuando el entorno sea producción y la base no tenga ningún usuario (es decir, cuando deba crear el administrador inicial), y MUST impedir completar el arranque si falta o está vacía. Si ya existen usuarios, el arranque no depende de esa variable.
- **FR-002**: El sistema MUST evitar la creación del usuario de prueba en producción.
- **FR-003**: Fuera de producción, el sistema MUST conservar los valores de desarrollo existentes y MUST emitir una advertencia clara cuando los use.
- **FR-004**: Las migraciones MUST poder ejecutarse repetidamente sobre la misma base sin fallar por restricciones ya aplicadas ni duplicar restricciones.
- **FR-005**: La base MUST aceptar únicamente `admin` y `comun` como valores de rol de usuario.
- **FR-006**: La base MUST aceptar únicamente `pendiente` y `atendida` como estados de alerta.
- **FR-007**: Las restricciones de rol y estado MUST aplicarse de forma idempotente y MUST conservar los registros existentes que ya cumplen los dominios válidos.
- **FR-008**: El backend MUST aplicar protecciones de seguridad HTTP sin modificar los formatos de respuestas, eventos ni endpoints existentes.
- **FR-009**: El backend MUST permitir configurar mediante `CORS_ORIGIN` una lista de orígenes separada por comas para las solicitudes REST y las conexiones en tiempo real.
- **FR-010**: Si `CORS_ORIGIN` no está configurado, el backend MUST permitir únicamente `http://localhost:8080`.
- **FR-011**: Las solicitudes REST y conexiones en tiempo real provenientes de orígenes no listados MUST NOT recibir autorización CORS.
- **FR-012**: La configuración de `CORS_ORIGIN` MUST estar documentada en el archivo de ejemplo de variables de entorno, sin incluir credenciales reales.
- **FR-013**: El cambio MUST preservar el contrato vigente de endpoints, formatos de eventos `lectura` y `alerta`, contrato MQTT y reglas de usuarios, incluyendo la invalidación de sesiones al cambiar contraseña o rol.

### Key Entities

- **Configuración de entorno**: Valores operativos que determinan el modo de ejecución, la credencial administrativa inicial y los orígenes autorizados.
- **Usuario**: Cuenta asociada a un cliente, cuyo rol solo puede ser `admin` o `comun`.
- **Alerta**: Registro de una condición ambiental, cuyo estado solo puede ser `pendiente` o `atendida`.
- **Migración**: Conjunto de cambios de inicialización de la base que puede aplicarse más de una vez sin efectos duplicados.
- **Origen autorizado**: Origen web incluido en la configuración y habilitado para consumir REST o establecer conexiones en tiempo real.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% de los arranques en producción sin `ADMIN_PASS` fallan antes de dejar el backend operativo.
- **SC-002**: 100% de las inicializaciones exitosas en producción crean cero usuarios de prueba.
- **SC-003**: Dos ejecuciones consecutivas de la migración sobre una base válida terminan exitosamente en 100% de las pruebas de repetición.
- **SC-004**: 100% de los intentos de persistir roles o estados fuera de los dominios definidos son rechazados por la base.
- **SC-005**: En las pruebas de CORS, 100% de los orígenes listados reciben autorización y 100% de los no listados no reciben cabeceras CORS, tanto en REST como en Socket.io.
- **SC-006**: Los nombres, cargas y formatos de los eventos y endpoints existentes permanecen sin cambios en la suite de regresión.

## Assumptions

- La base actual no contiene roles ni estados fuera de los dominios indicados por los requisitos.
- El entorno de desarrollo sigue usando la configuración local existente; la advertencia es informativa y no bloquea el arranque.
- La lista de `CORS_ORIGIN` se separa por comas, se normaliza quitando espacios laterales y no admite comodines.
- `http://localhost:8080` es el único origen permitido por defecto cuando no existe configuración explícita.
- HTTPS, nginx, Docker Compose, MQTT, rate limiting y cambios al contrato de `change-password` están fuera de alcance.
- La implementación reutiliza los mecanismos existentes de autenticación, persistencia, eventos y endpoints.

## Scope and Compatibility

Este cambio cubre el endurecimiento operativo y de integridad requerido por RNF01, RNF03 y RNF06, además de las reglas “Producción y configuración” y “Usuarios” de `docs/requisitos.md`. No incorpora cambios de esquema distintos de las restricciones CHECK, no cambia formatos de eventos o endpoints y no modifica MQTT ni infraestructura de despliegue.
