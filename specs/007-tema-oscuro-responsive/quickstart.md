# Quickstart de validación

## Prerrequisitos

1. Levantar el entorno local existente con Docker Compose según el README.
2. Abrir el frontend desde el flujo local habitual e iniciar sesión con un usuario
   común y con un usuario admin para validar las páginas restringidas.
3. Usar un navegador moderno con DevTools y emulación de viewport.

## Validación de tema

1. Eliminar `ecotrack_dark` desde Application/Storage y fijar la preferencia del
   sistema en claro; abrir cada página autenticada y comprobar tema claro.
2. Repetir con preferencia del sistema en oscuro; comprobar tema oscuro sin elección
   manual.
3. Alternar el control en dashboard, navegar por las seis páginas y recargar;
   verificar que el tema manual se conserva.
4. Inspeccionar sidebar, tarjetas, tablas, gráficos, formularios, modales, toasts,
   alertas, pop-ups, estados vacíos, foco, hover y disabled en ambos temas.
5. Si el almacenamiento está bloqueado, comprobar que el cambio de tema sigue
   funcionando durante la sesión y que no aparece una excepción no controlada.

## Validación responsive

Para cada página (`index.html`, `historico.html`, `configuracion.html`,
`auditor.html`, `usuarios.html`, `api-keys.html`):

1. Seleccionar viewport 360 x 800 y luego 1280 x 800.
2. Ejecutar las acciones principales de la página y abrir sus superficies
   interactivas.
3. Evaluar en claro y oscuro.
4. En consola, comprobar:

   ```js
   document.documentElement.scrollWidth <= document.documentElement.clientWidth
   ```

5. Si una tabla o gráfico requiere desplazamiento, comprobar que el scroll está en
   su contenedor y no en `document.documentElement`.
6. Registrar cada resultado en la matriz definida en
   [ui-theme-responsive.md](contracts/ui-theme-responsive.md), incluyendo
   observaciones y correcciones.

## Resultado esperado

- 24 combinaciones (6 páginas x 2 viewports x 2 temas) verificadas.
- Cero overflow horizontal del documento en 360 px.
- Tema efectivo e indicador consistentes en todas las páginas.
- Colores de canvas legibles y coherentes con las variables del tema.

## Evidencia de validación

Validación ejecutada el 2026-10-30 con navegador Chromium, usuario admin y servidor
estático local. Las 24 combinaciones pasaron sin overflow horizontal del documento
(`scrollWidth = clientWidth`):

| Página | 360 px claro | 360 px oscuro | 1280 px claro | 1280 px oscuro |
|---|---:|---:|---:|---:|
| Dashboard | PASS | PASS | PASS | PASS |
| Histórico | PASS | PASS | PASS | PASS |
| Configuración | PASS | PASS | PASS | PASS |
| Auditoría | PASS | PASS | PASS | PASS |
| Usuarios | PASS | PASS | PASS | PASS |
| API keys | PASS | PASS | PASS | PASS |

Las tablas conservaron el desplazamiento dentro de sus contenedores. El tema del
sistema se aplicó sin preferencia guardada; al alternar se guardó `light` o `dark`,
se actualizó el control accesible y la elección persistió al navegar a otra página.
