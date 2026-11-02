---
description: "Tareas para alinear el catálogo normativo EcoTrack con la tesis vigente"
---

# Tasks: Alinear requisitos con la tesis vigente

**Input**: Design documents from `specs/012-alinear-requisitos-tesis/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Scope**: Reconciliación documental por requisito. No cambia lógica de producto ni edita la tesis o la matriz externa.

## Phase 1: Setup

**Purpose**: Crear el crosswalk auditable que servirá como evidencia de cada disposición.

- [X] T001 Crear `specs/012-alinear-requisitos-tesis/crosswalk.md` con una fila por ID y las columnas definidas en `data-model.md`.

## Phase 2: Foundational — inventario y disposiciones

**Purpose**: Fijar las fuentes y clasificar todas las diferencias antes de cambiar el catálogo normativo.

- [X] T002 Enumerar RF01–RF23, RI01–RI25, RE01–RE06, RD01–RD10 y RNF01–RNF22 en `specs/012-alinear-requisitos-tesis/crosswalk.md`, citando sección de tesis, texto actual del catálogo y tipo de diferencia.
- [X] T003 Registrar en `specs/012-alinear-requisitos-tesis/crosswalk.md` la disposición de cada diferencia y separar los criterios extra del catálogo como candidatos no normativos, sin eliminarlos ni reasignarlos a otro ID.

**Checkpoint**: Las 86 filas están clasificadas; ninguna discrepancia se resolvió por promedio, inferencia de implementación o renumeración.

## Phase 3: User Story 1 — catálogo normativo coherente (Priority: P1)

**Goal**: Alinear el catálogo del repositorio con los criterios de la tesis acordada.

**Independent Test**: Revisar cada fila normativa de `docs/requisitos.md` contra la fuente correspondiente en la tesis y comprobar que los IDs permanecen estables.

### Implementation

- [X] T004 [US1] Actualizar el encabezado, la autoridad y las tablas RF01–RF23 y RI01–RI25 de `docs/requisitos.md` según el crosswalk y la tesis vigente.
- [X] T005 [US1] Actualizar las tablas RE01–RE06, RD01–RD10 y RNF01–RNF22 de `docs/requisitos.md` según el crosswalk, conservando unidades, cargas, umbrales, plazos y referencias normativas de la tesis.
- [X] T006 [US1] Alinear en `docs/requisitos.md` las reglas de negocio, límites de tasa y criterios de aceptación que repitan requisitos, y marcar los criterios adicionales identificados por T003 como candidatos pendientes de decisión.

## Phase 4: User Story 2 — trazabilidad honesta (Priority: P1)

**Goal**: Mantener separadas la intención normativa, el estado de implementación y la evidencia, y evitar referencias actuales a IDs con significado equivocado.

**Independent Test**: Revisar el crosswalk, las referencias actuales del README y las afirmaciones de estado contra `main`; confirmar que la matriz externa se usó solo como evidencia fechada.

### Implementation

- [X] T007 [US2] Actualizar en `README.MD` las referencias normativas o afirmaciones de pendientes que el crosswalk identifique como obsoletas, conservando solo estados confirmados en el checkout revisado.
- [X] T008 [US2] Revisar en `specs/001-aislar-eventos-cliente/` a `specs/010-endurecer-provisionamiento-wifi/` y en `origin/011-pruebas-unitarias-backend` las referencias cuyo ID cambia de significado; actualizar solo referencias vigentes que impidan usar el catálogo nuevo, preservar el historial cerrado y registrar el impacto/disposición en `specs/012-alinear-requisitos-tesis/crosswalk.md`.
- [X] T009 [US2] Registrar en `specs/012-alinear-requisitos-tesis/crosswalk.md` los cambios necesarios para la matriz externa de Downloads, incluidos estados fechados, IDs de interfaz ausentes y la fila RF23 afectada por OCR; no editar ese archivo externo en esta feature.
- [X] T010 [US2] Validar desde la raíz del repo que `docs/requisitos.md` tenga exactamente una fila para cada uno de los 86 IDs esperados, comparar el diff por ID con la tesis y revisar referencias afectadas según `quickstart.md`.
- [X] T011 [US2] Actualizar `ROADMAP.md` para marcar R1 como `done` y enlazar el crosswalk, solo después de satisfacer SC-001–SC-004.

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: sin dependencias; T001 establece el formato del crosswalk.
- **Phase 2 (Foundational)**: depende de T001 y bloquea toda edición normativa; T002 y T003 deben completarse antes de T004–T006.
- **Phase 3 (US1)**: depende de la clasificación completa de T002–T003; el catálogo normativo se alinea antes de actualizar referencias derivadas.
- **Phase 4 (US2)**: T007–T009 dependen del catálogo reconciliado; T010 valida todas las tareas anteriores; T011 cierra el roadmap al final.

### User Story Dependencies

- **US1**: requiere el crosswalk clasificado; entrega el catálogo coherente que necesitan las specs posteriores.
- **US2**: depende de US1 para revisar referencias y estados contra el significado ya fijado.

### Parallel Opportunities

- No se marcan tareas `[P]`: varias tareas escriben en el mismo crosswalk y la edición normativa debe seguir el orden de dependencias.

## Implementation Strategy

1. Construir y clasificar el crosswalk completo antes de modificar `docs/requisitos.md`.
2. Actualizar el catálogo normativo y documentar criterios adicionales fuera de los IDs de la tesis.
3. Reconciliar README y mapear impacto en specs sin reescribir el historial de features terminadas.
4. Ejecutar las comprobaciones documentales del quickstart y cerrar R1 en `ROADMAP.md` únicamente si los criterios de éxito pasan.

**MVP**: completar T001–T006 para dejar la fuente normativa del repo alineada; T007–T011 completan trazabilidad y cierre documental de esta feature.
