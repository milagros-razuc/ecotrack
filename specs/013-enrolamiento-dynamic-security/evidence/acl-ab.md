# Dynamic Security A/B ACL Matrix

- Resultado de la matriz registrada: **PASS (6/6)**.
- Fecha de la ejecución reportada: `2026-11-03T00:41:13.919Z`.
- Fuente: salida que ya estaba registrada en `report.md` antes de la revisión de cierre.
- Limitación: el archivo conserva la evidencia reportada; no se repitió aquí contra el broker porque Docker no estaba disponible.

| Caso | Operación | Topic | Esperado | Salida registrada | Estado |
|---|---|---|---|---|---|
| A publish own | publish | `ecotrack/DYNSEC-A/lecturas` | permitido | allowed (`PUBACK`) | PASS |
| A publish B | publish | `ecotrack/DYNSEC-B/lecturas` | rechazado | rejected (`Publish error: Not authorized`) | PASS |
| A subscribe B | subscribe | `ecotrack/DYNSEC-B/lecturas` | rechazado | rejected (`Subscribe error: Not authorized`) | PASS |
| B publish own | publish | `ecotrack/DYNSEC-B/lecturas` | permitido | allowed (`PUBACK`) | PASS |
| B publish A | publish | `ecotrack/DYNSEC-A/lecturas` | rechazado | rejected (`Publish error: Not authorized`) | PASS |
| B subscribe A | subscribe | `ecotrack/DYNSEC-A/lecturas` | rechazado | rejected (`Subscribe error: Not authorized`) | PASS |

El resultado acredita solo la matriz A/B ejecutada. No acredita la convivencia de una sesión estática, persistencia tras recrear el contenedor ni rollback.
