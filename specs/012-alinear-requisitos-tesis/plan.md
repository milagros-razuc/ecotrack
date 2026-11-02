# Implementation Plan: Alinear requisitos con la tesis vigente

**Branch**: `codex/baseline-requisitos` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-alinear-requisitos-tesis/spec.md`

## Summary

Reconciliar el catálogo versionado de requisitos con la tesis modificada el 2026-10-31, conforme al baseline acordado con el usuario. El trabajo es documental: comparar cada ID, registrar diferencias y disposiciones, actualizar el catálogo y revisar las referencias internas que quedarían semánticamente obsoletas. No modifica el comportamiento del producto ni convierte hallazgos de implementación en requisitos.

## Technical Context

**Language/Version**: Markdown; herramientas de búsqueda disponibles en el repo (`rg`, shell).  
**Primary Dependencies**: Spec Kit 1.0.13 integrado como Copilot Skills; `rg` para localizar IDs y referencias.  
**Storage**: Archivos Markdown versionados; tesis y matriz externa consultadas como insumos locales.  
**Testing**: Revisión documental ID por ID, conteo/unicidad de filas, revisión de referencias y `git diff --check`; no requiere tests de producto.  
**Target Platform**: Repositorio EcoTrack y entorno local con acceso a la tesis indicada.  
**Project Type**: Reconciliación de requisitos y documentación.  
**Performance Goals**: N/A; no cambia comportamiento ejecutable.  
**Constraints**: La tesis del 31/10 es fuente normativa; preservar IDs; no escribir en la tesis o matriz externa en esta feature; no borrar criterios extra sin disposición; preservar historial de specs completadas.  
**Scale/Scope**: 86 IDs en cinco dominios, matriz de RF/RE y referencias en README y specs 001–010.

## Constitution Check

*GATE: Must pass before research and after design.*

| Gate | Resultado | Motivo |
|---|---|---|
| II. Secure By Default | PASS | No se alteran credenciales, secretos ni controles de acceso. |
| III. Validated Data Contracts | PASS | No se cambia ningún contrato de producto; se restaurará el significado correcto de los criterios de seguridad en el catálogo. |
| IV. Testable Changes | PASS | No hay lógica de negocio nueva. La verificación se basa en correspondencia ID/fuente, conteo, unicidad y revisión del diff. |
| V. Reliable and Observable Operation | PASS | No cambia runtime; las afirmaciones operativas del README se revisan contra el catálogo reconciliado. |
| VI. Tenant Isolation | PASS | Los requisitos de aislamiento se mantienen con el texto y los IDs normativos de la tesis. |
| VII. Controlled and Auditable Access | PASS | Los requisitos de sesión, ACL y límites de tasa se reubican según el significado normativo, sin eliminar criterios sin disposición. |
| Fuente de requisitos del proyecto | PASS con actualización documental | La constitución mantiene `docs/requisitos.md` como fuente para specs; esta feature alinea ese catálogo con la tesis acordada. |

## Project Structure

### Documentation (this feature)

```text
specs/012-alinear-requisitos-tesis/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── crosswalk.md             # se genera y completa durante las tareas
├── checklists/requirements.md
└── tasks.md                 # se genera después de aprobar el plan
```

### Affected repository artifacts

```text
docs/requisitos.md           # catálogo normativo a reconciliar
README.MD                    # referencias y estados derivados a revisar
specs/001-*/ ... specs/010-*/ # referencias cruzadas a evaluar sin reescribir historial
specs/012-alinear-requisitos-tesis/ # crosswalk y validación de esta feature
```

**External read-only inputs**:

```text
/Users/ramacabrera/Documents/0-udemm/2026/proyecto-final/PROYECTO FINAL DE SISTEMAS-ECOTRACK.md
/Users/ramacabrera/Downloads/matriz_trazabilidad_ecotrack.md
```

**Structure Decision**: Mantener el catálogo y el crosswalk en Markdown. La tesis y matriz se comparan como insumos; esta fase no escribe fuera del repositorio. No se crea código ni cambia el esquema de producto.

## Phase 0: Research

Las fuentes, autoridad normativa, método de resolución y diferencias principales están consolidadas en [research.md](research.md). La revisión cubre RF/RI, RE/RD/RNF, matriz y referencias a IDs del repo. La tesis prevalece por acuerdo del usuario; cualquier criterio adicional se registra para decisión, no se reasigna silenciosamente.

## Phase 1: Design

- [data-model.md](data-model.md) define el registro editorial de reconciliación y su ciclo.
- No se requiere `contracts/`: no cambian interfaces de producto.
- [quickstart.md](quickstart.md) define la comparación manual por ID, la comprobación de filas/duplicados y las referencias que deben revisarse.

## Constitution Re-check

Después del diseño siguen vigentes los mismos gates: el cambio es documental, preserva los criterios de seguridad/aislamiento y deja la evidencia de conciliación revisable. Las tareas deben mantener separado el texto normativo del estado de implementación y detenerse ante cualquier requisito extra que exija cambiar la tesis o eliminarse del catálogo.

## Complexity Tracking

No aplica: no se introduce infraestructura, dependencia ni cambio de producto.
