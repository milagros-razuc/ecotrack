# Research: Tema oscuro y uso responsive

## Decisión 1: Estado del tema en el shell compartido

- **Decision**: Resolver el tema efectivo al inicio de `frontend/shared/app.js`,
  priorizando una preferencia manual válida; si no existe, consultar
  `window.matchMedia('(prefers-color-scheme: dark)')`; aplicar la clase al elemento
  raíz y sincronizar todos los controles después de inyectar el sidebar.
- **Rationale**: Todas las páginas autenticadas ya cargan `app.js`, por lo que se
  evita duplicar lógica y se mantiene el comportamiento al navegar directamente a
  cualquier URL.
- **Alternatives considered**: Implementar un script independiente por página
  (duplica estados y puede divergir); usar solo CSS `prefers-color-scheme` (no
  permite persistir una elección manual).

## Decisión 2: Persistencia tolerante a fallas

- **Decision**: Encapsular lectura, escritura y eliminación de la preferencia en
  helpers con `try/catch`; aceptar únicamente valores reconocibles y continuar con
  el tema del sistema o claro si el almacenamiento falla.
- **Rationale**: `localStorage` puede estar bloqueado, lleno o lanzar excepciones en
  contextos restringidos. El fallo no debe impedir el uso del dashboard.
- **Alternatives considered**: Acceder directamente a `localStorage` (ya existe,
  pero no cumple el requisito de robustez); guardar en cookies (agrega complejidad y
  no es necesario para una preferencia local).

## Decisión 3: Variables CSS semánticas

- **Decision**: Definir variables para fondo, superficie, texto, texto secundario,
  borde, color primario, color de datos y estados en `:root`, redefinirlas bajo
  `.dark`, y hacer que `common.css`, estilos inline migrados y componentes visuales
  usen esas variables.
- **Rationale**: Un único contrato de colores permite cubrir componentes que hoy
  dependen de clases Tailwind o hexadecimales aislados y facilita que los gráficos
  lean el mismo tema.
- **Alternatives considered**: Aumentar únicamente overrides `.dark` por clase
  Tailwind (mantiene colores hardcodeados y no resuelve gráficos); reemplazar
  Tailwind (fuera de alcance y riesgoso).

## Decisión 4: Colores de Chart.js derivados del tema

- **Decision**: Exponer un helper compartido que use
  `getComputedStyle(document.documentElement).getPropertyValue(...)` para obtener
  variables CSS, construir las opciones/datasets con esos valores y actualizar los
  gráficos al cambiar de tema.
- **Rationale**: Chart.js dibuja en canvas y no recibe automáticamente estilos CSS.
  Leer las variables garantiza contraste coherente en dashboard, histórico y
  auditoría.
- **Alternatives considered**: Duplicar paletas claro/oscuro dentro de cada HTML
  (difícil de mantener); usar colores fijos (incumple el requisito).

## Decisión 5: Verificación responsive sin dependencia nueva

- **Decision**: Mantener contenedores `overflow-x-auto` solo alrededor de tablas o
  superficies que realmente no pueden comprimirse; aplicar `min-width: 0`, wrapping
  y límites de ancho a flex/grid, modales, alertas y gráficos; validar con una
  matriz manual en 360 px y 1280 px.
- **Rationale**: El proyecto no tiene runner frontend configurado y la feature no
  debe agregar librerías. La inspección de `scrollWidth`, interacción y estados
  cubre directamente los criterios de aceptación.
- **Alternatives considered**: Ocultar columnas o rediseñar tablas (pierde
  información y contradice el alcance); agregar un framework responsive (librería y
  rediseño fuera de alcance).
