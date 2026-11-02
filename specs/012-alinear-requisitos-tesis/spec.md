# Feature Specification: Alinear requisitos con la tesis vigente

**Feature Branch**: `codex/baseline-requisitos`  
**Created**: 2026-11-02  
**Status**: Draft — revisión de alcance  
**Roadmap**: [R1 en `ROADMAP.md`](../../ROADMAP.md#orden-y-paralelismo)  
**Input**: User direction from the planning thread: use the current thesis as the normative baseline and reconcile repository requirements and traceability without confusing implementation status with requirement intent.

## User Scenarios & Testing

### User Story 1 — Mantener una fuente normativa coherente (Priority: P1)

Como integrante del equipo EcoTrack, necesito que el catálogo versionado de requisitos coincida con la tesis vigente para que las specs, pruebas y evaluación del producto usen los mismos criterios.

**Why this priority**: Las specs del proyecto deben citar los IDs definidos en `docs/requisitos.md`, pero ese archivo contiene criterios que difieren de la tesis acordada como baseline.

**Independent Test**: Comparar los requisitos y criterios de `docs/requisitos.md` con la tabla normativa de la tesis y verificar que el catálogo resultante conserve los IDs acordados y sus valores.

**Acceptance Scenarios**:

1. **Given** la tesis vigente y el catálogo de requisitos del repositorio, **When** se completa la reconciliación, **Then** el catálogo conserva los IDs RF01–RF23, RI01–RI25, RE01–RE06, RD01–RD10 y RNF01–RNF22 con sus criterios normativos.
2. **Given** que un requisito de la matriz o de un documento del repositorio difiere de la tesis, **When** se revisa la diferencia, **Then** queda resuelta contra la tesis o registrada explícitamente para decisión, sin cambiar en silencio el criterio normativo.

### User Story 2 — Conservar trazabilidad honesta de implementación (Priority: P1)

Como responsable de calidad, necesito distinguir el requisito normativo de su estado de implementación y de la evidencia de prueba para evitar declarar cumplimiento solo porque exista código.

**Why this priority**: Las pruebas unitarias no demuestran por sí solas aceptación física, rendimiento o funcionamiento integrado.

**Independent Test**: Revisar que los documentos de requisitos no incluyan resultados de implementación como si fueran parte del criterio normativo y que cada desviación conocida permanezca visible como estado/evidencia separado.

**Acceptance Scenarios**:

1. **Given** un requisito implementado sin evidencia de aceptación, **When** se actualiza la trazabilidad, **Then** el requisito conserva su criterio y el estado queda separado como pendiente de evidencia.
2. **Given** una diferencia ya resuelta en código (por ejemplo, filtros históricos), **When** se actualiza el estado, **Then** se corrige la trazabilidad sin reescribir el requisito.

## Edge Cases

- Un ID está presente en la tesis y falta en `docs/requisitos.md`.
- Un ID aparece duplicado o con un criterio distinto entre fuentes.
- El repositorio contiene un requisito sin ID equivalente en la tesis.
- Una spec ya implementada refleja el criterio anterior; la reconciliación no debe alterar su historial sin dejar una referencia al cambio acordado.
- La matriz de trazabilidad está en una ruta externa al repositorio y no debe convertirse en una segunda fuente normativa.

## Requirements

### Functional Requirements

- **FR-001**: El catálogo normativo del repositorio MUST conservar los 86 IDs definidos por la tesis: RF01–RF23, RI01–RI25, RE01–RE06, RD01–RD10 y RNF01–RNF22.
- **FR-002**: El texto y los criterios de cada requisito MUST coincidir con la tesis vigente, incluyendo unidades, umbrales, volúmenes, plazos y condiciones de aceptación.
- **FR-003**: La reconciliación MUST identificar requisitos duplicados, ausentes, extra o divergentes y registrar su resolución; no MUST eliminar ni renumerar IDs sin una decisión documentada.
- **FR-004**: El catálogo MUST mantener el criterio normativo separado del estado actual de implementación, prueba y aceptación.
- **FR-005**: Las specs nuevas o revisadas MUST citar los IDs normativos de `docs/requisitos.md`; no MUST introducir criterios contradictorios sin reconciliar primero el catálogo.
- **FR-006**: Los valores observados en el código o en pruebas MUST documentarse como estado/evidencia, no como sustituto del requisito normativo.

### Key Entities

- **Requisito normativo**: Identificador estable (RF, RI, RE, RD o RNF), descripción y criterio de aceptación tomado de la tesis vigente.
- **Diferencia de fuentes**: Desacuerdo entre tesis, catálogo, matriz o spec, con resolución y referencia a la fuente acordada.
- **Evidencia de cumplimiento**: Resultado observado de una prueba o inspección asociado a un requisito sin alterar su texto normativo.

## Success Criteria

### Measurable Outcomes

- **SC-001**: El catálogo del repositorio contiene exactamente una entrada para cada uno de los 86 IDs normativos de la tesis.
- **SC-002**: No quedan diferencias de criterio sin resolver entre la tesis vigente y `docs/requisitos.md`; las diferencias adicionales se registran para decisión en lugar de descartarse.
- **SC-003**: Cada diferencia corregida incluye una referencia verificable a la sección de la tesis o al acuerdo que la resuelve.
- **SC-004**: El documento permite identificar por separado el requisito normativo, el estado de implementación y el tipo de evidencia requerida.

## Assumptions

- La versión de tesis modificada el 2026-10-31 es la autoridad normativa para este trabajo, según la instrucción del usuario en el chat de planificación.
- `docs/requisitos.md` seguirá siendo el catálogo de requisitos versionado que consultan las specs y el código.
- La matriz ubicada en `~/Downloads/matriz_trazabilidad_ecotrack.md` es una derivación de trabajo; se compara para detectar diferencias, pero no reemplaza el catálogo versionado.
- Esta feature reconcilia documentación y trazabilidad. No cambia código de producto ni declara que los requisitos estén implementados o aceptados.
