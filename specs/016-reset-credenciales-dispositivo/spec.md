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
- Dynamic Security ya no contiene uno de los recursos esperados.
- Falla la base después de modificar Dynamic Security.
- Falla la compensación; el estado no debe presentarse como exitoso y debe quedar un
  diagnóstico sanitizado para resolución manual.
- Una solicitud concurrente de reset o enrolamiento no debe producir dos estados válidos
  simultáneos.

## Requirements

### Functional Requirements

- **FR-001**: El backend MUST exponer una operación de reset protegida exclusivamente
  para usuarios con rol admin.
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
