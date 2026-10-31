# Feature Specification: Tema oscuro y uso responsive

**Feature Branch**: `007-tema-oscuro-responsive`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Antes de escribir la spec, leé la constitution y lo ya implementado en el repo; reutilizá lo existente y marcá qué parte ya está hecha y qué falta. Quiero (a) un tema oscuro para todo el dashboard web y (b) verificar y corregir el uso en celular. Historias de usuario: alternar entre tema claro y oscuro desde el dashboard y recordar la elección, por defecto la preferencia del sistema; el tema oscuro cubre todas las páginas y superficies; en celular todas las páginas funcionan sin scroll horizontal, con controles tocables y tablas/gráficos adaptables o desplazables dentro de su contenedor. Criterios de aceptación: lista de páginas verificadas en ancho celular y escritorio, en ambos temas. Fuera de alcance: rediseño de la interfaz."

## Contexto y estado actual

La implementación existente ya aporta parte de la solución y debe reutilizarse:

- **Ya implementado**: Tailwind está configurado para alternar por clase (`darkMode: "class"`), todas las vistas autenticadas cargan `shared/common.css`, existe una función `toggleDark()` compartida y varias páginas exponen el botón de tema.
- **Ya implementado**: la preferencia manual se guarda en `localStorage` mediante la clave `ecotrack_dark`.
- **Ya implementado**: hay overrides oscuros compartidos para fondos, textos, bordes, filas alternadas y el pop-up de alerta.
- **Ya implementado**: las páginas tienen meta viewport; varias tablas ya están dentro de contenedores `overflow-x-auto`; los gráficos usan Chart.js con configuración responsive en las vistas que los incluyen.
- **Pendiente**: cuando no existe una elección guardada, la interfaz no deriva el tema de la preferencia del sistema operativo; actualmente parte de claro.
- **Pendiente**: el estado inicial de todos los botones/íconos de tema debe sincronizarse con el tema efectivo y mantenerse consistente al navegar entre páginas.
- **Pendiente**: revisar y completar contraste y superficies no cubiertas (formularios, modales, tablas, gráficos, alertas, pop-ups y estados de interacción) en cada página.
- **Pendiente**: verificar cada página en anchos móvil y escritorio, corregir desbordes del viewport y asegurar controles táctiles; cualquier desplazamiento de tablas o gráficos debe quedar confinado a su contenedor.
- **Pendiente**: dejar evidencia reproducible de la matriz de páginas, anchos y temas verificados.

La fuente de requisitos del proyecto exige dashboard adaptable a distintos tamaños de pantalla (RNF10, RNF11), dashboard con panel, histórico, auditoría, configuración, usuarios y perfil (RI01), visualización y alertas (RF06, RF10, RF13, RI02, RI03, RI04, RI05, RI07, RI08, RI09), y compatibilidad con navegadores modernos. Esta feature no cambia contratos de backend, autorización, datos ni reglas de negocio.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Alternar y recordar el tema (Priority: P1)

Como usuario autenticado, quiero alternar entre tema claro y oscuro desde cualquier página del dashboard para elegir una presentación cómoda y conservarla cuando vuelva a navegar.

**Why this priority**: Es la capacidad principal solicitada y debe funcionar antes de validar la cobertura visual de cada vista.

**Independent Test**: Abrir una página autenticada sin preferencia guardada, comprobar el tema del sistema, alternar el control, navegar a otra página y recargar; la elección manual debe conservarse y el control debe representar el estado actual.

**Acceptance Scenarios**:

1. **Given** que no existe una elección guardada, **When** el usuario abre el dashboard, **Then** se muestra el tema claro u oscuro que indique la preferencia del sistema operativo.
2. **Given** que no existe una elección guardada y el sistema no expone preferencia oscura, **When** el usuario abre el dashboard, **Then** se muestra el tema claro.
3. **Given** que el dashboard está en un tema, **When** el usuario activa el control de tema, **Then** todas las superficies visibles cambian al tema opuesto sin recargar y el control actualiza su etiqueta o indicador accesible.
4. **Given** que el usuario eligió manualmente un tema, **When** navega entre dashboard, histórico, configuración, auditoría, usuarios y api-keys o recarga una de ellas, **Then** se conserva esa elección independientemente de la preferencia posterior del sistema.
5. **Given** que el usuario borra la elección guardada, **When** vuelve a abrir el dashboard, **Then** se vuelve a aplicar la preferencia vigente del sistema.

---

### User Story 2 - Usar todas las vistas en celular (Priority: P1)

Como usuario en celular, quiero consultar y operar todas las páginas del dashboard sin que el contenido se corte ni obligue a desplazar toda la página horizontalmente.

**Why this priority**: La adaptación móvil es un requisito explícito de la interfaz y afecta la accesibilidad de todas las tareas existentes.

**Independent Test**: Verificar cada página autenticada en un viewport móvil representativo y ejecutar sus acciones principales; confirmar que el viewport no tiene desplazamiento horizontal, que los controles se pueden tocar y que tablas/gráficos se desplazan solo dentro de su contenedor cuando no pueden comprimirse.

**Acceptance Scenarios**:

1. **Given** un viewport de celular de 360 px de ancho, **When** el usuario abre cada página autenticada, **Then** ningún elemento provoca scroll horizontal del documento y el contenido principal sigue siendo legible.
2. **Given** una tabla con más columnas que el ancho disponible, **When** el usuario la consulta en celular, **Then** la tabla conserva sus columnas legibles y el desplazamiento horizontal ocurre únicamente dentro del contenedor de la tabla.
3. **Given** un gráfico en celular, **When** el usuario lo visualiza o cambia filtros, **Then** el gráfico cabe en su tarjeta o permite desplazamiento/ajuste dentro de esa tarjeta sin desbordar el documento.
4. **Given** un formulario, modal, alerta o pop-up en celular, **When** el usuario lo abre, completa o cierra, **Then** sus controles permanecen visibles, tienen un área táctil utilizable y no quedan fuera del viewport.
5. **Given** un usuario común, **When** abre las vistas disponibles para su rol en celular, **Then** las mismas reglas responsive se cumplen sin alterar las restricciones de navegación existentes.

---

### User Story 3 - Leer todas las superficies en ambos temas (Priority: P2)

Como usuario del dashboard, quiero que el tema oscuro sea legible y consistente en todas las páginas y componentes para no perder información ni acciones por falta de contraste.

**Why this priority**: Completa el alcance visual después de asegurar el cambio de tema y la operabilidad móvil.

**Independent Test**: Recorrer cada página en tema claro y oscuro y revisar encabezados, sidebar, tarjetas, tablas, gráficos, formularios, modales, alertas, pop-ups, estados vacíos, errores y controles interactivos.

**Acceptance Scenarios**:

1. **Given** cualquier página autenticada en tema oscuro, **When** el usuario recorre su contenido y abre sus componentes interactivos, **Then** fondos, textos, bordes, controles, estados hover/focus/disabled y mensajes mantienen contraste legible.
2. **Given** un gráfico con leyenda, ejes, etiquetas o tooltip, **When** se muestra en tema oscuro, **Then** sus elementos se distinguen del fondo y siguen siendo interpretables.
3. **Given** una alerta visual, toast o pop-up, **When** aparece en tema oscuro, **Then** se diferencia del contenido, su texto se lee y su acción de cierre sigue siendo visible.
4. **Given** una modal abierta en cualquier página, **When** el usuario cambia o ya tiene tema oscuro, **Then** la capa, el panel, los campos y los botones usan el tema correcto sin flashes de tema claro.

### Edge Cases

- El sistema operativo cambia de preferencia mientras no existe una elección manual: la siguiente aplicación del tema debe reflejar la preferencia vigente sin sobrescribir una elección manual existente.
- El navegador no permite leer o guardar la preferencia local: la interfaz debe seguir funcionando y usar la preferencia del sistema o el tema claro como fallback visible, sin presentar un estado incoherente.
- El usuario llega directamente a una página autenticada distinta del dashboard: esa página debe aplicar el mismo tema antes de que el contenido sea utilizable.
- Un texto, identificador de dispositivo, token de API o mensaje largo no debe ensanchar el documento; debe ajustarse o permanecer desplazable dentro de su superficie.
- Un modal abierto, un pop-up de alerta o un panel lateral no debe crear scroll horizontal del documento en celular.
- Los permisos de usuario no deben cambiar por la aplicación del tema ni por los ajustes responsive.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El dashboard MUST permitir alternar entre tema claro y oscuro desde una acción visible y accesible en cada página autenticada que actualmente exponga acciones de encabezado.
- **FR-002**: El sistema MUST usar la preferencia del sistema operativo cuando el usuario no tenga una elección manual guardada.
- **FR-003**: El sistema MUST recordar la elección manual del usuario en el navegador y aplicarla de forma consistente al navegar y recargar las páginas autenticadas.
- **FR-004**: El sistema MUST actualizar el nombre, estado o indicador accesible del control de tema para que refleje la acción disponible y el tema efectivo.
- **FR-005**: El tema oscuro MUST cubrir dashboard, histórico, configuración, auditoría, usuarios, api-keys, sidebar, perfil, modales, tablas, gráficos, formularios, toasts, alertas y pop-ups.
- **FR-006**: El tema oscuro MUST conservar contraste legible para texto, información, controles, estados de interacción, datos de tablas, leyendas y etiquetas de gráficos.
- **FR-007**: El sistema MUST mantener intactas la autenticación, la autorización por rol, el aislamiento por cliente y las acciones existentes al aplicar el tema o los ajustes responsive.
- **FR-008**: Todas las páginas autenticadas MUST poder utilizarse en un viewport móvil de 360 px de ancho sin scroll horizontal del documento.
- **FR-009**: Todas las páginas autenticadas MUST poder utilizarse en un viewport de escritorio de 1280 px de ancho sin pérdida de contenido ni controles superpuestos.
- **FR-010**: Los botones, enlaces, campos, selectores y acciones principales MUST conservar un área táctil utilizable en celular, con foco y estados visibles.
- **FR-011**: Las tablas MUST adaptarse al ancho disponible o desplazarse horizontalmente solo dentro de un contenedor propio, sin ampliar el viewport del documento.
- **FR-012**: Los gráficos MUST adaptarse al ancho de su tarjeta o desplazarse dentro de ella, manteniendo legibles sus datos y controles asociados.
- **FR-013**: Los modales, formularios, toasts, alertas y paneles laterales MUST caber dentro del viewport móvil, permitir cerrar o completar la acción y no crear desbordamiento horizontal.
- **FR-014**: La validación de la feature MUST registrar, para cada página, resultado en 360 px y 1280 px en tema claro y oscuro, incluyendo observaciones de tablas, gráficos y superficies interactivas.

### Key Entities

- **Preferencia de tema**: Elección manual clara u oscura asociada al navegador del usuario; cuando no existe, se utiliza la preferencia del sistema.
- **Página autenticada**: Dashboard, histórico, configuración, auditoría, usuarios y api-keys, sujetas a disponibilidad según rol.
- **Superficie de interfaz**: Componente visible o interactivo que debe conservar legibilidad y operabilidad, como sidebar, tabla, gráfico, modal, formulario, alerta, toast o pop-up.
- **Matriz de verificación responsive**: Evidencia de revisión por página, viewport y tema, con resultado y observaciones.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las páginas autenticadas (dashboard, histórico, configuración, auditoría, usuarios y api-keys) se verifica en 360 px y 1280 px, tanto en tema claro como oscuro, con la matriz de verificación registrada.
- **SC-002**: En el 100% de las verificaciones móviles, el documento no presenta scroll horizontal; cualquier desplazamiento necesario de tabla o gráfico queda contenido en su superficie.
- **SC-003**: El 100% de los componentes incluidos en el alcance (sidebar, modales, tablas, gráficos, formularios, toasts, alertas y pop-ups) mantiene texto y controles legibles en ambos temas, sin elementos visibles con estilo de tema opuesto.
- **SC-004**: En una prueba de navegación que recorra las seis páginas autenticadas, la elección manual del tema se conserva en las seis páginas y después de recargar.
- **SC-005**: Con una elección manual ausente, el tema mostrado coincide con la preferencia del sistema en el 100% de las páginas verificadas.
- **SC-006**: Al menos el 90% de los usuarios de prueba puede completar una tarea principal de cada página disponible para su rol en menos de 5 minutos y sin capacitación específica, manteniendo RNF14.

## Assumptions

- La lista de páginas autenticadas a verificar es: `index.html`, `historico.html`, `configuracion.html`, `auditor.html`, `usuarios.html` y `api-keys.html`; `usuarios.html` y `api-keys.html` se validan con un usuario admin.
- El login queda fuera del selector de tema porque la solicitud se limita al dashboard web autenticado; no se rediseña ni se cambia su flujo.
- Se reutilizarán la configuración de tema, los estilos compartidos, los botones existentes y los contenedores responsive antes de agregar mecanismos nuevos.
- Los anchos representativos de aceptación son 360 px para celular y 1280 px para escritorio; también se revisarán puntos intermedios cuando una corrección lo requiera.
- La preferencia manual del usuario tiene prioridad sobre cambios posteriores de la preferencia del sistema hasta que sea eliminada.
- No se modifican endpoints, datos, permisos, gráficos de negocio ni la estructura visual general; solo se corrigen inconsistencias necesarias para tema y adaptación responsive.

## Trazabilidad de requisitos

Esta feature implementa o verifica **RNF10**, **RNF11**, **RNF14**, **RI01**, **RI02**, **RI03**, **RI04**, **RI05**, **RI06**, **RI07**, **RI08**, **RI09**, **RF06**, **RF07**, **RF10**, **RF13**, **RF17** y **RF20**. No modifica los contratos de backend ni contradice los requisitos existentes.
