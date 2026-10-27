# Implementation Plan: Aislamiento histórico al transferir un dispositivo

**Branch**: `003-aislamiento-historico-dispositivo` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-aislamiento-historico-dispositivo/spec.md`

**Scope**: Este documento contiene únicamente el plan solicitado. No se generan `research.md`, `data-model.md`, `contracts/` ni `quickstart.md`.

## Summary

RNF18 debe conservar la pertenencia histórica de cada lectura y alerta aunque el dispositivo cambie de cliente. La migración y la escritura histórica ya están implementadas en el working tree; el trabajo restante es eliminar cualquier dependencia del dueño actual en lecturas y alertas, completar la transición de baja/reclamo y cubrir el flujo A → baja → B → reclamo con una prueba de integración.

El plan mantiene el stack existente y usa `cliente_id` almacenado en cada lectura/alerta como fuente de autorización y enrutamiento histórico. Las consultas de datos históricos no deben volver a unir con `dispositivos.cliente_id` para decidir visibilidad. La baja dejará el dispositivo sin dueño y eliminará sus umbrales dentro de una operación consistente; el reclamo iniciará una nueva etapa de pertenencia sin modificar registros históricos.

## Technical Context

**Language/Version**: Node.js existente del proyecto, CommonJS

**Primary Dependencies**: Express, `pg`, MQTT, Socket.IO, `node:test`; no se agregan dependencias

**Storage**: PostgreSQL existente; `lecturas.cliente_id` y `alertas.cliente_id` ya fueron agregados, backfilleados e indexados por `migrate.js`

**Testing**: `npm test` y, como mínimo, `src/test/realtime.integration.test.js` contra `TEST_DATABASE_URL`

**Target Platform**: Backend Node.js ejecutado localmente mediante Docker Compose o directamente en el entorno existente

**Project Type**: Servicio web backend con ingesta MQTT, API REST y eventos Socket.IO

**Performance Goals**: Mantener el tiempo de procesamiento de una lectura dentro del comportamiento actual; las consultas históricas deben conservar sus índices por `cliente_id`

**Constraints**: No cambiar el payload MQTT ni los eventos públicos existentes; no incorporar credenciales por dispositivo, ACL, TLS ni token de reclamo; no añadir dependencias

**Scale/Scope**: Una única transferencia de dispositivo y sus superficies de lectura/alertas: servicios, API pública, dashboard/API protegida, MQTT/Socket.IO, umbrales y prueba de integración

## Constitution Check

*GATE: Must pass before implementation. Re-check after implementation design.*

| Gate | Estado | Justificación |
|---|---|---|
| I. Modular Boundaries | PASS | Los cambios se limitan a servicios existentes, procesamiento MQTT y pruebas de integración; no se mezclan responsabilidades de rutas y persistencia. |
| II. Secure By Default | PASS | La pertenencia histórica se resuelve desde datos persistidos y `clienteId` autenticado/API key; no se acepta un cliente desde la solicitud. |
| III. Validated Data Contracts | PASS | Se conserva la validación MQTT y los contratos REST actuales; no se cambia el formato de entrada. |
| IV. Testable Changes | PASS | Se agrega cobertura de integración del flujo de transferencia y se mantienen las pruebas existentes de aislamiento en tiempo real. |
| V. Reliable and Observable Operation | PASS | No se agregan dependencias ni cambios de infraestructura; la baja será consistente y las operaciones existentes mantienen sus contratos. |
| VI. Tenant Isolation | PASS | Lecturas y alertas se filtran por su `cliente_id` histórico; eventos y API pública se enrutan con esa misma pertenencia. |
| VII. Controlled and Auditable Access | PASS | La baja y el reclamo conservan las rutas administrativas y la auditoría existentes; el plan no relaja autorización. |

## Project Structure

### Documentation (this feature)

```text
specs/003-aislamiento-historico-dispositivo/
└── plan.md              # Este plan
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── mqtt/client.js
│   ├── routes/
│   │   ├── alertas.js
│   │   ├── dispositivos.js
│   │   └── public.routes.js
│   ├── services/
│   │   ├── alertas.service.js
│   │   ├── dispositivos.service.js
│   │   ├── lecturas.service.js
│   │   └── umbrales.service.js
│   └── test/
│       ├── realtime.integration.test.js
│       └── realtime.test-support.js
```

**Structure Decision**: Se mantiene la estructura backend existente. Las consultas REST protegidas y públicas reutilizan los servicios de lecturas/alertas; el procesamiento MQTT concentra la emisión de eventos; la gestión de dispositivos mantiene baja, reclamo y umbrales en sus servicios actuales. No se prevén cambios en el frontend estático porque consume los mismos endpoints/eventos y no debe implementar reglas de aislamiento.

## Implementation Phases

### Phase 1 - Auditar y corregir superficies de lectura y alerta

1. Repetir el grep acotado de `cliente_id`, `d.cliente_id`, `l.cliente_id`, `a.cliente_id` e `INSERT INTO lecturas|alertas` en `backend/src` para identificar consultas restantes, incluyendo API pública, endpoints del dashboard, distribución/actualización de alertas y cualquier exportación existente.
2. Mantener `lecturas.service.js` y `alertas.service.js` como fuente de consulta histórica por `l.cliente_id` y `a.cliente_id`, eliminando o evitando cualquier filtro de visibilidad basado en `dispositivos.cliente_id`.
3. Revisar los `JOIN dispositivos` que solo enriquecen nombre/ubicación: deben conservarse para datos descriptivos, pero nunca convertirse en la condición que determine el cliente visible.
4. Ajustar el flujo MQTT para que la emisión de `lectura` y `alerta` use el mismo `cliente_id` que quedó asociado al registro insertado. El dato descartado por dispositivo sin dueño no debe emitir, guardar ni crear alerta. Evitar una segunda resolución mutable del dueño cuando pueda producir una emisión al cliente equivocado durante una transferencia.
5. Confirmar que la API pública, las rutas protegidas del dashboard, el histórico agregado, la distribución y la actualización de estado de alertas siguen pasando el `clienteId` autenticado o resuelto por API key, sin aceptar un cliente desde query/body.

### Phase 2 - Completar baja, reclamo y umbrales

1. Cambiar `dispositivosService.eliminar` para que, al validar que el dispositivo pertenece al cliente solicitante, establezca `cliente_id = NULL`, `activo = false`, `nombre = NULL` y `ubicacion = NULL`, y elimine los umbrales, todo dentro de una única transacción.
2. Garantizar que la baja no deje reglas heredadas ni permita evaluar lecturas posteriores mientras el dispositivo esté sin dueño; no existe reactivación de dispositivos que deba preservarse.
3. Preservar lecturas y alertas ya asociadas a A; la baja no debe borrar ni reatribuir esos registros.
4. Verificar que `crearOActualizar` permite reclamar un dispositivo con `cliente_id IS NULL` y no modifica lecturas, alertas ni datos históricos.
5. Mantener la auditoría de baja y reclamo y los códigos de respuesta existentes, documentando en el cambio cualquier ajuste necesario para que una operación parcialmente fallida no deje dueño y umbrales en estados incompatibles.

### Phase 3 - Prueba de integración del criterio de aceptación

1. Agregar un único test nuevo en `backend/src/test/realtime.integration.test.js`, en el nivel base de servicios: A consulta una lectura y una alerta; A da de baja el dispositivo; se verifica `cliente_id IS NULL` y la ausencia de umbrales; B reclama el dispositivo y genera datos nuevos; B ve únicamente los datos nuevos mediante los servicios y la API pública con su API key; A conserva sus propios datos. El test no verifica eventos por Socket.IO.

## Affected Contracts and Compatibility

- **Persistencia**: `lecturas.cliente_id` y `alertas.cliente_id` son la pertenencia histórica inmutable; los registros existentes se conservan.
- **Gestión de dispositivos**: la baja deja el dispositivo reclamable y sin `cliente_id`; el reclamo inicia una nueva etapa de pertenencia.
- **API REST y API pública**: se mantienen rutas, parámetros y formas de respuesta; cambia únicamente la selección correcta de registros históricos.
- **Tiempo real**: se mantienen los eventos `lectura` y `alerta` y sus payloads; cambia el cliente destinatario para seguir la pertenencia almacenada.
- **MQTT/firmware**: no cambia el tópico ni el payload de lecturas.
- **Fuera de alcance**: credenciales por dispositivo, ACL, TLS y token de reclamo.

## Complexity Tracking

No hay violaciones de la constitución ni complejidad adicional justificada. Se reutilizan el esquema, servicios, rutas, MQTT, Socket.IO y fixture de integración existentes.
