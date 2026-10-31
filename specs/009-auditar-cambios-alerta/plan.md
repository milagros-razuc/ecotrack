# Implementation Plan: Auditar cambios de estado de alertas

**Branch**: `009-auditar-cambios-alerta` | **Date**: 2026-10-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-auditar-cambios-alerta/spec.md`

## Summary

Completar la trazabilidad de las transiciones `pendiente`/`atendida`. El
estado y la acción histórica ya se escriben en la misma transacción por
`alertas.service.js`; el cambio pendiente es registrar además la operación en
`auditoria` mediante `auditoriaService.registrar`, sin alterar la respuesta de
`PATCH /api/alertas/:id`.

La implementación reutilizará `alerta_acciones` como fuente de verdad,
mantendrá `/acciones` por compatibilidad y agregará `/historial` como nombre
documentado. La interfaz conservará el modal de línea de tiempo y añadirá la
última acción visible en cada fila. El Registro de actividad continuará
uniendo auditoría administrativa y acciones de alertas, pero excluirá de la
rama administrativa las filas `accion = 'cambiar_estado_alerta'`, porque el
mismo cambio ya se muestra desde `alerta_acciones`. Así cada cambio de estado
aparece una sola vez.

Para las alertas existentes que no tienen `generar_alerta`, el endpoint
`/historial` derivará la entrada “Generada” desde `alertas.timestamp` y
`alertas.cliente_id` al consultar, sin migración ni backfill. Las alertas nuevas
seguirán escribiendo la acción de generación durante su creación.

## Technical Context

**Language/Version**: Node.js CommonJS existente; JavaScript estático en frontend

**Primary Dependencies**: Express, `pg`, Socket.IO, Zod y Node.js built-in test runner

**Storage**: PostgreSQL; tablas existentes `alertas`, `alerta_acciones` y
`auditoria`, con migraciones idempotentes en `migrate.js`

**Testing**: Tests de integración existentes con PostgreSQL, `fetch` y
`socket.io-client`; agregar cobertura para la fila administrativa sin
duplicación, la falla del INSERT de auditoria, el campo `origen` y contratos
de frontend

**Target Platform**: Backend Node.js/Express y frontend HTML servido por el
dashboard EcoTrack

**Project Type**: Aplicación web con API REST, MQTT, Socket.IO y frontend estático

**Performance Goals**: Consultas de historial acotadas por alerta y cliente,
usando el índice existente; el cambio de estado no espera conexiones realtime
para responder

**Constraints**: No aceptar `cliente_id` desde requests; conservar el cliente
histórico; mantener respuestas actuales; auditoría posterior y no bloqueante
respecto del cambio ya confirmado; no crear una tabla paralela

**Scale/Scope**: PATCH de alertas, endpoints de historial, actividad
administrativa, modal y columna de última acción en `auditor.html`, y
documentación de contratos y modelo

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Resultado | Evidencia |
|---|---|---|
| I. Modular Boundaries | PASS | La ruta delega en servicios existentes; persistencia en `alertas.service.js` y auditoría en `auditoria.service.js`. |
| II. Secure By Default | PASS | El cliente proviene del token y la alerta; actividad sigue restringida a admin. |
| III. Validated Data Contracts | PASS | Se reutiliza el schema actual de PATCH y los endpoints solo reciben el id de ruta. |
| IV. Testable Changes | PASS | Se cubrirán transición, aislamiento, compatibilidad y falla de auditoría. |
| V. Reliable and Observable Operation | PASS | Migración idempotente, respuesta compatible y error de auditoría observable sin revertir el estado. |
| VI. Tenant Isolation | PASS | Historial y auditoría filtran por `cliente_id` histórico/autenticado. |
| VII. Controlled and Auditable Access | PASS | Cada cambio válido se registra con `cambiar_estado_alerta` y entidad `alerta`; la actividad evita duplicarlo usando la acción histórica. |

## Project Structure

### Documentation (this feature)

```text
specs/009-auditar-cambios-alerta/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── alert-history-api.md
│   └── activity-api.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/src/
├── config/migrate.js
├── routes/alertas.js
├── routes/auditoria.js
├── services/alertas.service.js
├── services/alerta-acciones.service.js
├── services/auditoria.service.js
└── test/trazabilidad-alertas.integration.test.js
frontend/
└── auditor.html
docs/
└── PROYECTO FINAL DE SISTEMAS-ECOTRACK.md
```

**Structure Decision**: Mantener la estructura web existente. No se crea
`alertas_historial`: `alerta_acciones` ya satisface el modelo histórico,
contiene `usuario_username`, registra la generación y es consumida por el
Registro de actividad. La auditoría administrativa se agrega como una segunda
representación compatible del mismo hecho, pero sus filas
`cambiar_estado_alerta` se excluyen de la rama administrativa de la actividad
para evitar duplicados. El SELECT externo devuelve `origen` además de `id`, y
el frontend usa `origen + id` como identidad compuesta. `auditoria` se escribe
después del commit y sin bloquear ni revertir el cambio confirmado.

## Decisiones de implementación verificadas

- **Duplicados**: aplica la opción (a). `auditoria.service.js` debe agregar
  `WHERE accion <> 'cambiar_estado_alerta'` a la rama
  `SELECT ... FROM auditoria` de la consulta unificada (líneas 63-64); el
  filtro sí afecta la respuesta de `GET /api/auditoria` y la pestaña, mientras
  la tabla `auditoria` conserva todos los registros. Por eso
  `GET /api/auditoria?accion=cambiar_estado_alerta` devuelve vacío. La rama de
  `alerta_acciones` sigue mostrando cada transición y el resultado esperado es
  exactamente una fila por cambio.
- **Nombre histórico**: `alerta_acciones.usuario_username` ya existe y se
  persiste junto con `usuario_id` nullable; no requiere nueva migración de
  columna. Ver `backend/src/config/migrate.js:260` y
  `backend/src/services/alerta-acciones.service.js:4`.
- **Generación**: la creación automática ya inserta `generar_alerta` con el
  timestamp de la alerta antes del commit. Para alertas existentes sin esa fila,
  `/historial` debe derivar “Generada” desde `alertas.timestamp` y
  `alertas.cliente_id`, sin migración de datos. Ver
  `backend/src/services/alertas.service.js:21` y `:38`.
- **Orden y resiliencia**: `alerta_acciones` permanece dentro de la
  transacción del UPDATE; `auditoriaService.registrar` se invoca después del
  commit y su error no debe revertir el estado. El test debe simular la falla
  del `pool.query` que ejecuta el INSERT de `auditoria` (o un stub equivalente
  que lance dentro del servicio), comparar la respuesta de PATCH con la
  respuesta normal y verificar que la acción histórica quedó guardada.
- **Contrato de actividad**: el SELECT externo debe devolver `origen` además
  de `id`; `auditor.html` no debe usar `id` como clave única, sino `origen +
  id`, porque ambas ramas pueden producir el mismo id.
- **Comentario histórico**: `alerta-acciones.service.js:16-20` inserta el
  comentario recibido en `detalle`, y `:24-30` devuelve `aa.*` desde
  `listar`, por lo que `/historial` debe exponerlo como `detalle`.
- **Documentación**: mantener actualizados diccionario, 4.5.1/4.5.2, 4.3.2,
  4.6.6, 3.4 y CU06 en `docs/PROYECTO FINAL DE SISTEMAS-ECOTRACK.md`; el
  catálogo debe describir únicamente `/historial` y anotar que `/acciones` se
  conserva solo por compatibilidad.

## Complexity Tracking

No aplica: el plan reutiliza servicios, tabla, índices, endpoint compatible y
componentes de UI existentes; no introduce una nueva entidad paralela.
