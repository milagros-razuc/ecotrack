# Feature Specification: Resetear credenciales de un dispositivo

**Feature Branch**: `016-reset-credenciales-dispositivo`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Agregar un endpoint solo admin que borre rol y cliente en Dynamic Security y devuelva el dispositivo a reclamado, sin enrolar, con compensación ante fallos; no modificar los tests de enrolamiento."

## User Scenarios & Testing

### User Story 1 - Restablecer credenciales MQTT (Priority: P1)

Como administrador del cliente dueño, quiero resetear las credenciales MQTT de un
dispositivo enrolado para invalidar su acceso y dejarlo reclamado pero pendiente de
enrolamiento nuevamente.

**Why this priority**: Permite recuperar un dispositivo sin borrar su reclamo ni afectar
la trazabilidad de la fabricación.

**Independent Test**: Con un dispositivo enrolado y un doble de Dynamic Security,
ejecutar la operación como admin del cliente dueño y verificar la eliminación del cliente,
rol y ACL, `enrolled_at = NULL`, y que el dispositivo conserva su dueño.

**Acceptance Scenarios**:

1. **Given** un dispositivo enrolado y un admin del cliente dueño, **When** solicita el
   reset, **Then** se eliminan sus credenciales Dynamic Security y el estado queda
   reclamado, sin enrolar.
2. **Given** un usuario no admin o de otro cliente, **When** solicita el reset, **Then**
   recibe rechazo y no cambia ningún estado.
3. **Given** que falla una eliminación parcial de Dynamic Security, **When** termina la
   operación, **Then** se ejecuta compensación, se evita marcar falsamente el reset como
   exitoso y se informa un error sanitizado sin credenciales.

### Edge Cases

- El dispositivo no existe, no pertenece al cliente o no está enrolado.
- El dispositivo está reclamado pero ya fue reseteado (`enrolled_at IS NULL`):
  la operación debe ser idempotente, no recrear credenciales ni modificar el
  reclamo, y devolver el resultado idempotente definido por la API.
- El dispositivo nunca fue reclamado (`cliente_id IS NULL` o `reclamado_en IS NULL`):
  la operación debe rechazarse sin tocar Dynamic Security ni la base.
- Dynamic Security ya no contiene uno de los recursos esperados.
- Falla la base después de modificar Dynamic Security.
- Falla la compensación; el estado no debe presentarse como exitoso y debe quedar un
  diagnóstico sanitizado para resolución manual.
- Una solicitud concurrente de reset o enrolamiento no debe producir dos estados válidos
  simultáneos.

## Requirements

### Functional Requirements

- **FR-001**: El backend MUST exponer `POST
  /api/dispositivos/:codigo/reset-credenciales`, protegido exclusivamente para
  usuarios con rol admin.
- **FR-002**: La autorización MUST usar el `cliente_id` de la sesión y nunca un cliente
  enviado por el solicitante.
- **FR-003**: El reset MUST operar únicamente sobre un dispositivo reclamado y enrolado
  del cliente autorizado.
- **FR-004**: El reset MUST eliminar el cliente MQTT, su rol y sus tres ACL de Dynamic
  Security sin revelar credenciales.
- **FR-005**: Tras completar correctamente la operación, el sistema MUST conservar el
  reclamo en `dispositivos` y MUST establecer `dispositivos_fabrica.enrolled_at` en NULL.
- **FR-006**: El estado de enrolamiento MUST seguir viviendo en
  `dispositivos_fabrica.enrolled_at`; no se debe agregar `enrolled_at` a `dispositivos`.
- **FR-007**: La operación MUST ser compensatoria: ante un fallo de Dynamic Security o
  persistencia, no debe devolver éxito ni dejar un estado parcialmente presentado como
  válido.
- **FR-008**: Los errores MUST ser sanitizados y no incluir secretos, tokens,
  contraseñas ni identificadores sensibles completos.
- **FR-009**: La operación MUST mantener el contrato existente del enrolamiento y no
  modificar sus tests; los nuevos tests deben cubrir autorización, transición y
  compensación con dobles de Dynamic Security.
- **FR-010**: La operación MUST preservar el aislamiento entre clientes y no afectar
  dispositivos de otros clientes.
- **FR-011**: El contrato MUST definir el reset de un dispositivo ya reseteado como
  operación idempotente y segura; no debe crear recursos ni emitir un token nuevo.
  Un dispositivo nunca reclamado MUST rechazarse sin efectos laterales.
- **FR-012**: El orden MUST ser: bloquear y validar la fila local del dispositivo,
  ejecutar la eliminación de Dynamic Security, y confirmar `enrolled_at = NULL`
  dentro de la transacción local. Si falla la validación o la eliminación, la
  transacción local se revierte y no se devuelve éxito.
- **FR-013**: La compensación MUST especificar cada etapa: una eliminación parcial
  de Dynamic Security debe continuar con limpieza idempotente de los recursos
  restantes; un fallo antes de confirmar la base debe hacer `ROLLBACK` local; y
  un fallo de confirmación posterior a una eliminación exitosa debe devolver
  error sanitizado, registrar solo un diagnóstico no sensible y dejar explícita
  la reconciliación manual requerida, sin presentarlo como estado exitoso.
- **FR-014**: La compensación existente del enrolamiento, que elimina una identidad
  recién creada cuando falla la persistencia, MUST analizarse como no reutilizable
  para este reset sin modificarla: no restaura credenciales preexistentes y su
  uso destructivo no puede revertir un reset ya aplicado.
- **FR-015**: Trabajo separado de firmware (fuera de esta implementación backend):
  el firmware deberá detectar N rechazos consecutivos de autenticación MQTT,
  distinguirlos de broker caído o falta de red, borrar únicamente las credenciales
  operativas y la marca `mqttEnrolled` de NVS, conservar identidad de fábrica,
  secreto de fábrica y Wi-Fi, y volver a llamar al enrolamiento HTTPS sin token
  de reclamo nuevo.
- **FR-016**: Los tests de Dynamic Security MUST ejercitar el parser/transport real
  del adaptador con el formato MQTT Dynamic Security real: respuesta JSON con
  `responses[]`, elemento asociado por `command`, `error` cuando corresponde y
  `correlationData` MQTT; no alcanza con reemplazar directamente la función de
  request por objetos ya interpretados.
- **FR-017**: La nueva operación y sus tests MUST estar aislados de los contratos
  existentes de enrolamiento y reclamo; no se permite modificar sus rutas,
  servicios ni tests para hacer pasar el reset.

### Key Entities

- **Dispositivo reclamado**: relación persistente entre dispositivo y `cliente_id`.
- **Estado de enrolamiento**: marca `enrolled_at` en `dispositivos_fabrica`.
- **Recursos Dynamic Security**: cliente MQTT, rol y tres ACL asociados al dispositivo.

## Success Criteria

### Measurable Outcomes

- **SC-001**: El 100% de las solicitudes autorizadas exitosas deja el dispositivo
  reclamado y sin enrolar, sin credenciales MQTT activas.
- **SC-002**: El 100% de las solicitudes no autorizadas no cambia datos locales ni
  recursos Dynamic Security.
- **SC-003**: Los tests cubren al menos un fallo en cada etapa de eliminación y una
  compensación verificable, sin modificar tests de enrolamiento existentes.
- **SC-004**: Ningún secreto aparece en respuestas, logs o errores de la operación.

## Assumptions

- El estado local de enrolamiento ya existe en `dispositivos_fabrica.enrolled_at`.
- Dynamic Security ofrece operaciones reutilizables para eliminar los recursos creados
  durante el enrolamiento.
- El endpoint seguirá la autorización y validación existentes del backend.
- La operación no genera un nuevo token de reclamo ni reclama automáticamente el
  dispositivo.

### Verified implementation constraints

- El endpoint de enrolamiento acepta `device_id` y `device_secret`, y el servicio
  solo permite enrolar cuando existe reclamo y `enrolled_at IS NULL`; por lo tanto,
  un dispositivo reclamado y reseteado puede volver a enrolarse sin token nuevo,
  siempre que el firmware descarte las credenciales MQTT obsoletas.
- El firmware actual carga `mqttUser`, `mqttPassword` y `mqttEnrolled` desde NVS y,
  cuando están presentes, intenta MQTT sin pasar por enrolamiento; el reset debe
  incluir el comportamiento de recuperación de FR-015. Hasta que ese firmware se
  despliegue, un dispositivo reseteado desde el backend no se recupera solo y
  requiere reflashear el NVS.
- El adaptador actual elimina `deleteClient` y `deleteRole`, tolera entidades
  inexistentes y considera el rol como unidad de limpieza de sus ACL. La spec debe
  verificar ese contrato con respuestas reales y no asumir tres comandos
  `deleteRoleACL` independientes.
