# Dynamic Security Spike Report

- Resultado: **Aprobado**
- Fecha: 2026-11-03T00:41:13.919Z
- ACL estático: activo durante la prueba

| Caso | Operación | Topic | Esperado | Salida real | Estado |
|---|---|---|---|---|---|
| A publish own | publish | `ecotrack/DYNSEC-A/lecturas` | permitido | allowed (PUBACK) | PASS |
| A publish B | publish | `ecotrack/DYNSEC-B/lecturas` | rechazado | rejected (Publish error: Not authorized) | PASS |
| A subscribe B | subscribe | `ecotrack/DYNSEC-B/lecturas` | rechazado | rejected (Subscribe error: Not authorized) | PASS |
| B publish own | publish | `ecotrack/DYNSEC-B/lecturas` | permitido | allowed (PUBACK) | PASS |
| B publish A | publish | `ecotrack/DYNSEC-A/lecturas` | rechazado | rejected (Publish error: Not authorized) | PASS |
| B subscribe A | subscribe | `ecotrack/DYNSEC-A/lecturas` | rechazado | rejected (Subscribe error: Not authorized) | PASS |

Las contraseñas de A/B se generaron aleatoriamente y se conservaron únicamente en un archivo temporal fuera del repositorio.

## Migración mínima si el ACL estático bloquea clientes dinámicos

No se aplica automáticamente. El paso previsto es mover el usuario backend al plugin dynamic-security, verificar la convivencia y retirar `password_file` y `acl_file` de `mosquitto.conf` solo con aprobación explícita y rollback disponible.
