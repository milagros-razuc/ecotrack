# Quickstart: Validación de auditoría de cambios de alerta

## Prerrequisitos

- Docker Compose levantado con PostgreSQL y backend.
- `TEST_DATABASE_URL` configurada.
- Usuario autenticado y alerta del mismo cliente.

## Validación automatizada

Desde `backend` ejecutar:

```powershell
npm test -- --test-name-pattern="alerta|auditor"
```

Debe comprobar atención, reapertura, actor, nombre conservado, comentario,
orden temporal, generación derivada para alertas existentes, aislamiento entre
clientes, aparición única en Registro de actividad con `origen`, compatibilidad
de respuestas y que una falla del INSERT de auditoría no revierte el estado.

## Validación manual

1. Abrir `auditor.html` con un usuario autenticado.
2. Atender una alerta con nota y abrir “Historial”.
3. Confirmar generación, atención, actor, fecha y nota.
4. Reabrirla y confirmar la nueva entrada.
5. Como admin, abrir “Registro de actividad” y filtrar entidad `alerta`.
6. Repetir con otro cliente y confirmar que no aparece la alerta.

Ver [alert-history-api.md](./contracts/alert-history-api.md) y
[activity-api.md](./contracts/activity-api.md) para los contratos.
