# Implementation Plan: Tema oscuro y uso responsive

**Branch**: `007-tema-oscuro-responsive` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-tema-oscuro-responsive/spec.md`

## Summary

Implementar tema claro/oscuro y corregir la adaptación móvil en las seis páginas
autenticadas, reutilizando el shell compartido. La solución centraliza el estado del
tema en `frontend/shared/app.js`, expone colores semánticos como variables CSS en
`frontend/shared/common.css`, mantiene el fallback de clases existentes y hace que
Chart.js lea colores calculados del tema. La persistencia de la elección manual se
protegerá con `try/catch`, sin incorporar librerías nuevas.

## Technical Context

**Language/Version**: HTML5, CSS, JavaScript ES6+ ejecutado en navegadores modernos

**Primary Dependencies**: Tailwind CSS por CDN ya existente, Chart.js ya existente,
Socket.IO ya existente; no se agregan dependencias

**Storage**: Preferencia de tema en almacenamiento local del navegador, con fallback
en memoria durante la sesión si no está disponible

**Testing**: Verificación manual reproducible en navegador/DevTools con matriz de seis
páginas x dos viewports x dos temas; comprobaciones de `scrollWidth`, controles,
tablas, gráficos y modales. Ejecutar validaciones existentes del repositorio cuando
sean aplicables; no se introduce un runner nuevo

**Target Platform**: Navegadores modernos en escritorio y celular; viewports mínimos
de aceptación de 360 px y 1280 px

**Project Type**: Aplicación web estática autenticada con backend existente

**Performance Goals**: Cambio de tema sin recarga ni bloqueo perceptible; conservar
los objetivos existentes del dashboard (RE02)

**Constraints**: Sin rediseño; sin librerías nuevas; no modificar contratos backend,
permisos, aislamiento multi-cliente ni flujo de negocio; evitar scroll horizontal del
documento en 360 px; usar variables CSS para colores; persistencia protegida con
`try/catch`

**Scale/Scope**: Seis páginas autenticadas: dashboard, histórico, configuración,
auditoría, usuarios y api-keys; sidebar compartido, modales, tablas, gráficos,
formularios, toasts, alertas y pop-ups

## Constitution Check

* **I. Modular Boundaries**: PASS. La lógica transversal vive en `shared/app.js` y
  `shared/common.css`; las vistas solo adaptan sus superficies y gráficos.
* **II. Secure By Default**: PASS. No se modifican autenticación, autorización,
  tokens ni controles de rol; la preferencia visual no se usa como seguridad.
* **III. Validated Data Contracts**: PASS. No se agregan payloads ni interfaces de
  datos externos.
* **IV. Testable Changes**: PASS WITH DOCUMENTED UI VALIDATION. La conducta es de
  presentación; se agregará una matriz reproducible de verificación visual y
  responsive, además de comprobaciones de navegación y persistencia.
* **V. Reliable and Observable Operation**: PASS. No se cambian API, MQTT, datos ni
  operaciones del backend; se preservan fallbacks y se documentan resultados.
* **VI. Tenant Isolation**: PASS. No se cambia ninguna consulta, respuesta o evento.
* **VII. Controlled and Auditable Access**: PASS. No se agregan acciones sensibles ni
  se alteran logs.
* **Technology constraints**: PASS. Se mantiene HTML/CSS/JS estático, Tailwind y
  Chart.js ya presentes, sin dependencias nuevas.

## Project Structure

### Documentation (this feature)

```text
specs/007-tema-oscuro-responsive/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ui-theme-responsive.md
└── tasks.md                 # generado por /speckit-tasks
```

### Source Code (repository root)

```text
frontend/
├── index.html
├── historico.html
├── configuracion.html
├── auditor.html
├── usuarios.html
├── api-keys.html
└── shared/
    ├── app.js
    ├── common.css
    ├── sidebar.html
    ├── alerta-visual.js
    └── tailwind-config.js
```

**Structure Decision**: Mantener la estructura estática existente. Las reglas
transversales de tema, variables semánticas y sincronización se implementan en
`frontend/shared`; cada página conserva sus datos y markup, corrigiendo solo las
clases/estilos necesarios para responsive y superficies no cubiertas.

## Phase 0: Research

Las decisiones y alternativas están documentadas en [research.md](./research.md).
No quedan decisiones técnicas abiertas: el usuario fijó HTML/JS compartido,
variables CSS, persistencia protegida y ausencia de librerías nuevas.

## Phase 1: Design

- [data-model.md](./data-model.md) define la preferencia visual, las superficies y
  la matriz de verificación.
- [contracts/ui-theme-responsive.md](./contracts/ui-theme-responsive.md) define el
  contrato observable del tema, colores, gráficos y responsive.
- [quickstart.md](./quickstart.md) define la validación de las 24 combinaciones.

## Constitution Check (post-design)

PASS. El diseño mantiene límites compartidos del frontend, no agrega contratos de
backend ni datos sensibles, no cambia autorización o aislamiento, y deja una
validación reproducible para los cambios de presentación.

## Complexity Tracking

No hay violaciones de la constitution que requieran justificación.
