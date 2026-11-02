# Roadmap de cierre de EcoTrack

Este roadmap organiza el cierre técnico y académico en features independientes. Cada feature de producto tendrá su propio ciclo Spec Kit (`specify → clarify → plan → checklist/tasks → analyze → implement → converge`) y se implementará en un branch basado en `main`. Los cambios de alcance se acordarán en la spec antes de escribir código.

El baseline de detalle está en [docs/baseline-pendientes-2026-11.md](docs/baseline-pendientes-2026-11.md). La tesis actual indicada allí define los criterios académicos de referencia; `docs/requisitos.md` debe reconciliarse antes de crear specs que dependan de esos criterios, porque la constitución vigente lo declara fuente de requisitos.

**Estados:** planned · in-progress · done · blocked-by-decision

| ID | Paquete | Intención y límite de alcance | Depende de | Estado | Spec / artefacto |
|---|---|---|---|---|---|
| R1 | Reconciliar baseline de requisitos | Alinear `docs/requisitos.md` con la tesis, mapear diferencias de matriz externa y referencias de specs; corregir estados obsoletos del repo. No cambia comportamiento del producto. | — | in-progress | [Inventario fechado](docs/baseline-pendientes-2026-11.md); [Spec Kit 012](specs/012-alinear-requisitos-tesis/) |
| R2 | Suite 011 y trazabilidad | Reconciliar la rama de pruebas unitarias y sus TODOs/resultados contra `main`; separar cobertura unitaria, integración, hardware y carga. No declarar aceptación sin ejecución observada. | R1 | planned | `origin/011-pruebas-unitarias-backend` (pendiente de reconciliar) |
| R3 | Autenticación MQTT por dispositivo | Cerrar credenciales de entrega, conexión autenticada del ESP32 y ACL por identidad; preservar TLS y contrato de lecturas. No incluye configuración dinámica RF02. | R1 y coordinación de aprovisionamiento | planned | Próxima feature Spec Kit |
| R4 | Intervalo de captura configurable (RF02) | Configurar desde dashboard y confirmar valor aplicado por dispositivo; acordar rango/unidad, versión, persistencia y reconexión. | R3 | planned | Próxima feature Spec Kit |
| R5 | Aislamiento histórico y transferencia (RF18) | Revisar metadata histórica y concurrencia entre ingesta y transferencia; definir evidencia con PostgreSQL real. | R1 | planned | Próxima feature Spec Kit; revisar `specs/003-aislamiento-historico-dispositivo/` |
| R6 | Paginación del histórico | Hacer coincidir el contrato de página/total entre frontend y backend. | R1 | planned | Próxima feature Spec Kit |
| R7 | Edición de dispositivos (RF12) | Añadir modificación de los campos acordados con autorización por rol/cliente y auditoría. | R1 | planned | Próxima feature Spec Kit |
| R8 | API pública (RF19) | Confirmar el contrato de estado de dispositivos y cubrir API keys inválidas/revocadas y aislamiento. | R1 | blocked-by-decision | Próxima feature Spec Kit |
| R9 | Avisos de alertas fuera de la app | Decidir si forma parte del alcance y elegir canal/destinatarios antes de diseñar una solución. | Decisión de alcance | blocked-by-decision | A definir |
| R10 | Aceptación física y de rendimiento | Ejecutar pruebas en placa para firmware, portal y buffer; medir RE01–RE06 con baseline ya reconciliado. | R1, R3, R4 y criterios de aceptación de cada feature | planned | Quickstarts/evidencias por feature |
| R11 | Cierre documental académico | Escribir capítulo 6 con resultados reales y cerrar índices, diagramas, referencias, capítulos pendientes y revisión de supuestos VAN/TIR. | R1, R2 y evidencias R10 | planned | Tesis fuera del repositorio de código |

## Orden y paralelismo

- **Primero R1:** resuelve el conflicto entre el baseline normativo acordado y la fuente indicada por la constitución, y habilita specs trazables.
- **Después R3 → R4:** la autenticación MQTT y sus ACL habilitan el canal seguro requerido por RF02.
- **R5, R6 y R7** son paquetes independientes después de R1; pueden especificarse por separado y ejecutarse en branches distintos, evitando editar los mismos archivos en paralelo.
- **R8 y R9** esperan las decisiones de contrato/alcance anotadas en el baseline.
- **R10** recopila evidencia una vez que cada comportamiento esté estable; **R11** consume esa evidencia y cierra el relato académico.

## Regla de cierre por paquete

Cada feature avanza por etapas revisables: `spec.md` acordado; `plan.md` y contratos aprobados; `tasks.md` ordenado y analizado; implementación y pruebas de la fase; evidencia adjunta; convergencia de spec, plan, tareas y comportamiento. Un paquete se marca `done` solo cuando se cumple su criterio y la documentación vinculada refleja el resultado observado.
