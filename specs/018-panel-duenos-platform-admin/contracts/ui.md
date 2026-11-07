# Contrato de interfaz: Panel de plataforma

- Ruta separada, servida por el mismo origen.
- Visible únicamente cuando el rol local es `platform_admin`; el backend sigue
  siendo la autoridad.
- Tabla con cliente, código, estado de ciclo de vida, firmware, última lectura,
  última conexión y estado online/offline.
- Cuando `ultima_lectura = null`, mostrar exactamente
  “sin lectura reciente (últimos N días)”, donde N es el valor efectivo de
  `PLATFORM_LAST_READING_WINDOW_DAYS`; nunca mostrar “nunca”.
- `PLATFORM_LAST_READING_WINDOW_DAYS` debe ser un entero positivo y no superar el
  tope configurado del sistema. Un valor ausente usa 30 días; un valor inválido
  debe rechazarse explícitamente y no convertirse silenciosamente en “nunca”.
- Filtros por cliente, estado y firmware; paginación con límite máximo.
- Botón de reset con confirmación explícita.
- Resultado genérico `reset`/`already_reset`, sin detalles internos.
- El cliente no ve el actor personal; la auditoría tenant muestra
  “Administración de la plataforma”.
