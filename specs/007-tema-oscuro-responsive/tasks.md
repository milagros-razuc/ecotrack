---

description: "Task list for implementing the dark theme and responsive dashboard"
---

# Tasks: Tema oscuro y uso responsive

**Input**: Design documents from `/specs/007-tema-oscuro-responsive/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: No se agregan tests automatizados porque la especificación solicita verificación visual y responsive reproducible, no TDD. La validación manual está incluida en la fase final.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar el alcance de archivos y conservar la estructura existente.

- [X] T001 Confirmar el alcance de las seis páginas autenticadas y los puntos de entrada compartidos en `frontend/index.html`, `frontend/historico.html`, `frontend/configuracion.html`, `frontend/auditor.html`, `frontend/usuarios.html`, `frontend/api-keys.html` y `frontend/shared/`
- [X] T002 [P] Registrar la línea base de colores hardcodeados, botones de tema, gráficos Chart.js y contenedores de overflow en `frontend/shared/common.css`, `frontend/shared/app.js` y las seis páginas autenticadas

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Crear los contratos compartidos que necesitan las tres historias.

**⚠️ CRITICAL**: Completar esta fase antes de implementar historias de usuario.

- [X] T003 Definir variables CSS semánticas para fondos, superficies, texto, texto secundario, bordes, primario, datos, foco y estados en `frontend/shared/common.css`, con valores claro en `:root` y oscuro bajo `.dark`
- [X] T004 [P] Crear helpers compartidos de lectura, escritura y eliminación de `ecotrack_dark` en `frontend/shared/app.js`, aceptando solo `light` o `dark` y capturando excepciones de almacenamiento con `try/catch`
- [X] T005 [P] Crear en `frontend/shared/app.js` el helper que lea colores calculados desde las variables CSS del documento y una notificación compartida para que los gráficos puedan refrescarse después de un cambio de tema
- [X] T006 Revisar `frontend/shared/sidebar.html` y `frontend/shared/alerta-visual.js` para reemplazar colores directos de superficies, textos, bordes y sombras por variables semánticas, preservando la estructura y el comportamiento actuales

**Checkpoint**: Contrato de tema, fallback de almacenamiento y paleta compartida listos para las historias.

---

## Phase 3: User Story 1 - Alternar y recordar el tema (Priority: P1) 🎯 MVP

**Goal**: Aplicar el tema efectivo desde la preferencia manual o del sistema, alternarlo sin recargar y mantener sincronizados todos los controles.

**Independent Test**: Sin `ecotrack_dark`, comprobar claro/oscuro según `prefers-color-scheme`; alternar el control, navegar por las seis páginas y recargar; luego bloquear el almacenamiento y comprobar que el cambio sigue funcionando durante la sesión sin excepciones no controladas.

### Implementation for User Story 1

- [X] T007 [US1] Implementar en `frontend/shared/app.js` la resolución inicial del tema priorizando `ecotrack_dark`, usando `window.matchMedia('(prefers-color-scheme: dark)')` cuando no haya preferencia manual y usando claro como fallback
- [X] T008 [US1] Actualizar `toggleDark()` en `frontend/shared/app.js` para persistir con el helper protegido, aplicar o quitar `.dark`, emitir el cambio para gráficos y sincronizar todos los controles sin recargar
- [X] T009 [US1] Sincronizar estado, icono, `title` y `aria-label` de todos los botones `#btn-dark` desde `frontend/shared/app.js`, incluyendo los botones presentes antes y después de `initShell()` en `frontend/index.html`, `frontend/historico.html`, `frontend/configuracion.html`, `frontend/auditor.html`, `frontend/usuarios.html` y `frontend/api-keys.html`
- [X] T010 [US1] Ajustar los documentos raíz de `frontend/index.html`, `frontend/historico.html`, `frontend/configuracion.html`, `frontend/auditor.html`, `frontend/usuarios.html` y `frontend/api-keys.html` para evitar un estado inicial contradictorio con el tema resuelto por `app.js`, sin alterar autenticación ni navegación

**Checkpoint**: El tema se alterna y recuerda correctamente en todas las páginas autenticadas.

---

## Phase 4: User Story 2 - Usar todas las vistas en celular (Priority: P1)

**Goal**: Eliminar overflow horizontal del documento en 360 px y conservar controles, tablas y gráficos utilizables.

**Independent Test**: En cada página autenticada, probar viewport 360 x 800 y 1280 x 800, comprobar que `document.documentElement.scrollWidth <= document.documentElement.clientWidth`, y verificar que cualquier desplazamiento restante ocurre solo dentro de tablas o gráficos.

### Implementation for User Story 2

- [X] T011 [P] [US2] Corregir wrapping, `min-width: 0`, gaps, padding y controles del dashboard en `frontend/index.html`, incluyendo header, tarjetas, panel de notificaciones, filtros, tabla y gráfico sin cambiar la información mostrada
- [X] T012 [P] [US2] Corregir header, filtros, tarjetas de gráficos y contenedor de tabla del histórico en `frontend/historico.html`, manteniendo el overflow horizontal confinado a la tabla
- [X] T013 [P] [US2] Corregir selector, tarjetas, tabla, formularios y acciones de configuración en `frontend/configuracion.html` para 360 px, manteniendo controles tocables y sin overflow del documento
- [X] T014 [P] [US2] Corregir filtros, pestañas, tabla, gráfico y modal de auditoría en `frontend/auditor.html`, confinando tablas/gráficos a sus contenedores y manteniendo visibles las acciones
- [X] T015 [P] [US2] Corregir header, filtros, tabla, modal y botones de usuarios en `frontend/usuarios.html` para 360 px, sin modificar restricciones `data-admin-only`
- [X] T016 [P] [US2] Corregir header, tabla, modales y presentación de claves largas en `frontend/api-keys.html`, evitando que tokens o acciones ensanchen el documento
- [X] T017 [US2] Ajustar superficies compartidas en `frontend/shared/sidebar.html`, `frontend/shared/alerta-visual.js` y `frontend/shared/common.css` para que sidebar, modales, alertas, pop-ups y formularios permanezcan dentro del viewport móvil con áreas táctiles utilizables

**Checkpoint**: Las seis páginas funcionan en celular y escritorio sin overflow horizontal del documento.

---

## Phase 5: User Story 3 - Leer todas las superficies en ambos temas (Priority: P2)

**Goal**: Cubrir todas las superficies con variables CSS y garantizar que los gráficos usen colores legibles del tema efectivo.

**Independent Test**: Recorrer cada página en claro y oscuro y revisar shell, tarjetas, tablas, gráficos, formularios, modales, toasts, alertas, pop-ups, estados vacíos, errores, hover, focus y disabled.

### Implementation for User Story 3

- [X] T018 [P] [US3] Migrar colores directos y estados interactivos de dashboard, tarjetas, toasts, panel de notificaciones, tabla y modal en `frontend/index.html` a variables CSS o clases semánticas compatibles con ambos temas
- [X] T019 [P] [US3] Migrar colores directos, estados de filtros, tarjetas, tabla y formularios en `frontend/historico.html` y `frontend/configuracion.html` a variables CSS, incluyendo foco y estados activos
- [X] T020 [P] [US3] Migrar colores directos, estados de pestañas, tablas, tarjetas, paneles y modales en `frontend/auditor.html`, `frontend/usuarios.html` y `frontend/api-keys.html` a variables CSS
- [X] T021 [US3] Actualizar las configuraciones Chart.js de `frontend/index.html`, `frontend/historico.html` y `frontend/auditor.html` para obtener borde, relleno, texto, grilla, leyenda, ejes y tooltip desde el helper de variables CSS, y refrescarlas al evento de cambio de tema
- [X] T022 [US3] Revisar `frontend/shared/common.css`, `frontend/shared/sidebar.html` y `frontend/shared/alerta-visual.js` para asegurar contraste legible de fondos, textos, bordes, controles, alertas, toasts y pop-ups en claro y oscuro sin estilos opuestos visibles

**Checkpoint**: Todas las superficies y gráficos son legibles y consistentes en ambos temas.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validar el resultado completo y dejar evidencia de aceptación.

- [X] T023 Ejecutar el quickstart de `specs/007-tema-oscuro-responsive/quickstart.md` con usuario común y admin, documentando las 24 combinaciones en `specs/007-tema-oscuro-responsive/quickstart.md` o en una evidencia vinculada sin alterar los criterios
- [X] T024 Verificar en las seis páginas que no se modificaron autenticación, autorización, aislamiento por cliente, navegación por rol ni contratos backend, revisando `frontend/shared/app.js`, `frontend/shared/sidebar.html` y las vistas afectadas
- [X] T025 [P] Ejecutar linting, validaciones disponibles y comprobaciones de sintaxis sobre los archivos HTML/CSS/JS modificados, y corregir solo errores introducidos por esta feature
- [X] T026 Revisar el diff final contra `specs/007-tema-oscuro-responsive/spec.md`, `specs/007-tema-oscuro-responsive/contracts/ui-theme-responsive.md` y `specs/007-tema-oscuro-responsive/data-model.md`, confirmando que no se agregaron librerías nuevas

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Phase 2; MVP independiente.
- **User Story 2 (Phase 4)**: Depends on Phase 2; puede ejecutarse en paralelo con US1 si no se pisan los mismos fragmentos.
- **User Story 3 (Phase 5)**: Depende de Phase 2 y de la base de US1 para refrescar gráficos y controles; sus tareas por página pueden paralelizarse.
- **Polish (Phase 6)**: Depende de las historias seleccionadas.

### User Story Dependencies

- **US1 (P1)**: No depende de otra historia después de Foundational.
- **US2 (P1)**: No depende funcionalmente de US1; comparte archivos, por lo que conviene integrar cambios antes de ejecutar la validación final.
- **US3 (P2)**: Depende de los helpers de Foundational y de la aplicación de tema de US1 para probar el cambio dinámico de gráficos.

### Parallel Opportunities

- T004 y T005 pueden ejecutarse en paralelo después de T003.
- T011-T016 pueden ejecutarse en paralelo por página después de T010, coordinando conflictos por estilos compartidos.
- T018-T020 pueden ejecutarse en paralelo por grupos de páginas después de T017.
- T025 puede ejecutarse en paralelo con T023 y T024 una vez terminadas las historias.

## Parallel Example: User Story 1

```text
Task T007: Resolver tema inicial y preferencia del sistema en frontend/shared/app.js
Task T009: Sincronizar controles de tema en frontend/shared/app.js y las seis páginas
```

## Parallel Example: User Story 2

```text
Task T011: Responsive del dashboard en frontend/index.html
Task T012: Responsive del histórico en frontend/historico.html
Task T013: Responsive de configuración en frontend/configuracion.html
Task T014: Responsive de auditoría en frontend/auditor.html
Task T015: Responsive de usuarios en frontend/usuarios.html
Task T016: Responsive de api-keys en frontend/api-keys.html
```

## Parallel Example: User Story 3

```text
Task T018: Tema del dashboard en frontend/index.html
Task T019: Tema de histórico y configuración en frontend/historico.html y frontend/configuracion.html
Task T020: Tema de auditoría, usuarios y api-keys en sus archivos HTML
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Setup y Foundational.
2. Implementar US1 en `shared/app.js` y las seis entradas HTML.
3. Validar preferencia del sistema, persistencia, navegación y fallback con almacenamiento bloqueado.
4. Entregar el toggle funcional antes de abordar correcciones responsive y cobertura visual completa.

### Incremental Delivery

1. Agregar US2 por página y validar overflow/controles en cada grupo.
2. Agregar US3 y actualizar colores de Chart.js desde variables CSS.
3. Ejecutar la matriz completa de 24 combinaciones y las validaciones de no regresión.
