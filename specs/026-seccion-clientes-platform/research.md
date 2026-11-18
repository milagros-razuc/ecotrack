# Research: Seccion Clientes de plataforma

## Decisiones

### Nueva superficie de navegación

- **Decision**: agregar `clientes.html` como página independiente para
  `platform_admin`, con el ítem «Clientes» en los menús desktop y móvil.
- **Rationale**: separa la gestión de clientes del panel global de dispositivos
  sin crear rutas visuales alternativas.
- **Alternatives considered**: mantener la vista dentro de `plataforma.html` se
  descartó porque el requisito pide una sección propia. Una pestaña sin URL propia
  no satisface acceso directo ni navegación independiente.

### Contrato de listado eficiente

- **Decision**: extender `GET /api/plataforma/clientes` para incluir, en la misma
  consulta SQL, los administradores asociados a cada cliente.
- **Rationale**: PostgreSQL puede resolver todos los clientes y administradores
  con joins/agrupación en una sola solicitud.
- **Alternatives considered**: conservar `GET /clientes` y llamar
  `/clientes/:id/usuarios` por fila se descartó por el requisito explícito de
  rendimiento.

### Rol y estado administrativo

- **Decision**: un administrador es un usuario existente con `rol = 'admin'`
  asociado al cliente. Usuarios eliminados dejan de aparecer.
- **Rationale**: coincide con la gestión existente y con la regla de impedir
  eliminar al único administrador activo.
- **Alternatives considered**: introducir estado activo nuevo duplicaría
  semántica y requeriría migración no solicitada.

### Regla de varios administradores

- **Decision**: mostrar todos los `admin` activos y exigir elegir explícitamente
  uno antes de resetear.
- **Rationale**: evita ambigüedad sin asumir qué cuenta debe recibir la temporal.
  La normal operativa sigue siendo un único administrador por cliente.
- **Alternatives considered**: resetear a todos se descartó por ampliar el impacto;
  deshabilitar toda la fila se descartó porque impide recuperación excepcional.

### Reubicación de usuarios por cliente

- **Decision**: mover el selector y tabla existentes a `clientes.html`; retirar esa
  sección de `plataforma.html`.
- **Rationale**: elimina duplicación y concentra clientes, administradores y
  usuarios en la nueva sección.
- **Alternatives considered**: mantener una vista duplicada se descartó por
  ambigüedad de navegación y mantenimiento.

### Reset y entrega única

- **Decision**: reutilizar exclusivamente
  `POST /api/usuarios/:id/reset-password` y el servicio de la Feature 024.
- **Rationale**: ya genera, hashea, invalida sesiones, exige cambio obligatorio
  y audita sin persistir el valor temporal.
- **Alternatives considered**: agregar un endpoint de plataforma duplicaría
  autorización y auditoría.

## Resultado

No quedan decisiones técnicas pendientes.
