# Contrato del reporte de trazabilidad

El archivo `docs/trazabilidad-unitarias.md` debe contener una fila por cada CP-ID con estas
columnas:

| Campo | Obligatorio | Regla |
|---|---|---|
| CP-ID | Sí | `CP-RFxx` o `CP-REyy` |
| Requisito | Sí | RF01-RF23 o RE01-RE06 |
| Archivo | Sí | ruta relativa bajo `backend/src/test` o `PENDIENTE` |
| Test | Sí | nombre exacto de `describe`/`it` o `PENDIENTE` |
| Modalidad | Sí | Unitaria, Ruta, Integración existente o Fuera de alcance |
| Estado | Sí | `Aprobado`, `Fallido` o `Pendiente` |
| Motivo | Condicional | obligatorio para `Fallido`, `Pendiente` o fuera de alcance |

No se permiten estados `Asumido`, porcentajes sin ejecución ni filas sin CP-ID.
