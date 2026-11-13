# UI Contract: Tema y adaptación responsive

## Tema

- El documento raíz aplica exactamente una clase de tema efectiva: `dark` para
  oscuro o ausencia de `dark` para claro.
- La preferencia manual se guarda con la clave existente `ecotrack_dark` solo si
  el navegador permite usar almacenamiento local.
- Sin preferencia manual válida, el tema efectivo es claro, sin consultar
  `prefers-color-scheme`.
- El control de tema debe estar sincronizado después de cargar el shell y exponer
  un nombre/etiqueta accesible que describa la acción.
- `plataforma.html` también debe exponer `#btn-dark` y compartir la preferencia de
  tema de `localStorage` con el resto de las páginas autenticadas.
- Cambiar el tema no navega, no recarga y no cambia autenticación, rol ni datos.

## Colores

- Los colores de superficies y texto se consumen mediante variables CSS semánticas
  definidas en `frontend/shared/common.css`.
- Los gráficos obtienen colores mediante las variables calculadas del documento,
  no mediante hexadecimales independientes por vista.
- Todo componente de alerta o modal debe conservar texto y acción de cierre
  visibles en claro y oscuro.

## Responsive

- En 360 px el documento no puede tener `document.documentElement.scrollWidth >
  document.documentElement.clientWidth`.
- Tablas y gráficos que necesiten más espacio pueden desplazarse, pero el
  desplazamiento debe estar en su contenedor y no en el documento.
- Modales, pop-ups, formularios y acciones principales deben permanecer dentro del
  viewport y tener foco/acción de cierre accesibles.
- La validación cubre las seis páginas autenticadas en 360 px y 1280 px, en ambos
  temas.
