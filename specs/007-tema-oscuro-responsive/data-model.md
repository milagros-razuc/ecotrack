# Data Model: Tema oscuro y uso responsive

## Preferencia de tema

Representa la elección visual del usuario en el navegador.

| Campo | Tipo lógico | Regla |
|---|---|---|
| `mode` | `light` o `dark` | Único valor persistible aceptado |
| `source` | `manual` o `system` | `manual` cuando existe elección guardada; `system` como fallback |
| `storageAvailable` | booleano | Si es falso, la sesión continúa sin persistencia |

No se agrega entidad de backend ni se envía este dato a la API. La preferencia
manual tiene prioridad sobre `prefers-color-scheme`; sin preferencia manual se
recalcula desde el sistema al iniciar una página.

## Superficie de interfaz

Cada superficie debe declarar o heredar colores semánticos del tema:

- shell: body, header, sidebar y navegación;
- contenido: tarjetas, estados vacíos, tablas y formularios;
- interacción: foco, hover, disabled, botones y selectores;
- feedback: modal, toast, alerta visual, pop-up y mensajes de error;
- visualización: canvas, leyenda, ejes, grilla, tooltip y datos.

## Matriz de verificación

Una fila representa una combinación verificable:

| Campo | Valores |
|---|---|
| `page` | dashboard, histórico, configuración, auditoría, usuarios, api-keys |
| `viewport` | 360 px, 1280 px |
| `theme` | claro, oscuro |
| `documentHorizontalOverflow` | debe ser falso |
| `containedSurfaceOverflow` | permitido solo para tabla/gráfico cuando corresponda |
| `interactiveSurfaceResult` | controles visibles, tocables y operables |
| `notes` | observaciones y correcciones aplicadas |
