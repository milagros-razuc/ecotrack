# Contrato API: Panel de plataforma

Todas las solicitudes usan `Authorization: <JWT crudo>`, sin `Bearer`.
Todos los endpoints requieren JWT válido y rol `platform_admin`; sin token o token
inválido responden 401 y otros roles responden 403.

## GET `/api/plataforma/resumen`

Devuelve totales globales de clientes operativos, dispositivos por estado y
distribución de firmware. El cliente especial “plataforma” no aparece.

## GET `/api/plataforma/clientes`

Devuelve clientes operativos con `id`, `nombre` y conteos por estado. No incluye el
cliente especial “plataforma”.

## GET `/api/plataforma/dispositivos`

Query validada:

- `cliente_id` opcional, solo clientes operativos.
- `estado` opcional: `fabricado`, `reclamado_sin_enrolar`, `enrolado`.
- `firmware` opcional.
- `pagina` y `limite`, con máximo documentado y aplicado.
- `PLATFORM_LAST_READING_WINDOW_DAYS` es configuración del servidor: entero
  positivo, con tope máximo configurado; si falta, vale 30. Un valor inválido
  impide arrancar o activar el panel con un error explícito de configuración.

Cada dispositivo devuelve únicamente:
`codigo`, `cliente`, `nombre`, `estado`, `firmware_version`,
`firmware_reported_at`, `ultima_lectura`, `ultima_conexion`, `reclamado_en`,
`enrolled_at` y `online/offline`.

`ultima_lectura` es `lecturas.timestamp`; `ultima_conexion` es
`dispositivos.ultima_conexion`. Cuando no existe lectura dentro de la ventana,
`ultima_lectura` es `null` y la interfaz debe mostrar exactamente
“sin lectura reciente (últimos N días)”, sustituyendo N por el valor efectivo de
`PLATFORM_LAST_READING_WINDOW_DAYS`; nunca debe mostrar “nunca”.

## POST `/api/plataforma/dispositivos/:codigo/reset-credenciales`

- No acepta `cliente_id` en el body.
- Resuelve el cliente operativo del dispositivo.
- Delega en el servicio de reset de la spec 016.
- Devuelve `reset` o `already_reset`.
- Registra auditoría con cliente afectado y actor de plataforma sanitizado.
- Error genérico para dispositivo inexistente/no elegible.
- Rate limit aplicado.
