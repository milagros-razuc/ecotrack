# Contrato de interfaz: Panel de plataforma

- Ruta separada, servida por el mismo origen.
- Visible únicamente cuando el rol local es `platform_admin`; el backend sigue
  siendo la autoridad.
- Tabla con cliente, código, estado de ciclo de vida, firmware, última lectura,
  última conexión y estado online/offline.
- Filtros por cliente, estado y firmware; paginación con límite máximo.
- Botón de reset con confirmación explícita.
- Resultado genérico `reset`/`already_reset`, sin detalles internos.
- El cliente no ve el actor personal; la auditoría tenant muestra
  “Administración de la plataforma”.
