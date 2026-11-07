# Data Model: Panel global de dueños de plataforma

## Cliente

- `id`: identificador estable.
- `nombre`: nombre visible; el cliente especial tiene nombre estable “plataforma”.
- `es_plataforma`: marca booleana explícita, con valor por defecto `false`; la
  migración debe ser repetible y garantizar una única fila marcada.
- `activo`: estado operativo existente.
- Relación: posee dispositivos y usuarios.
- Regla: el cliente especial queda excluido de listados, filtros y conteos
  operativos del panel.

## Usuario

- `id`, `username`, `nombre`, `password_hash`, `token_version`.
- `rol`: `admin`, `comun` o `platform_admin`.
- `cliente_id`: referencia al cliente especial para `platform_admin`.
- Regla: `platform_admin` no es alias de `admin` y no hereda sus rutas.
- Seed: migración y seed idempotentes; crea o reutiliza el cliente marcado y el
  usuario `platform_admin` asociado, sin exponerlos por API pública ni por el panel
  operativo.

## Dispositivo

- `codigo`: clave funcional y clave de unión con fabricación.
- `cliente_id`: cliente operativo dueño; puede ser nulo para fabricado sin reclamar.
- `nombre`, `activo`, `reclamado_en`, `ultima_conexion`.
- `firmware_version`, `firmware_reported_at`.
- Estado derivado:
  - `fabricado`: sin `cliente_id` o sin `reclamado_en`.
  - `reclamado sin enrolar`: reclamado y `enrolled_at` nulo.
  - `enrolado`: reclamado y `enrolled_at` no nulo.

## Dispositivo de fábrica

- `device_id`: clave primaria; se une a `dispositivos.codigo`.
- `enrolled_at`: fecha de enrolamiento; fuente única del estado de enrolamiento.
- `factory_secret_hash`: nunca se expone.
- Relación: `LEFT JOIN dispositivos_fabrica.device_id = dispositivos.codigo`.

## Lectura

- `dispositivo_codigo`: dispositivo asociado.
- `timestamp`: instante de captura; fuente de “última lectura”.
- Índice: `(dispositivo_codigo, timestamp DESC)`.
- Consulta: después de paginar dispositivos, `LEFT JOIN LATERAL` por dispositivo
  con `WHERE timestamp >= NOW() - (ventana_días * INTERVAL '1 day')`,
  `ORDER BY timestamp DESC LIMIT 1`. La ventana por defecto es de 30 días y es
  configurable.
- Si no hay lectura dentro de la ventana, `ultima_lectura` es explícitamente
  `null` y la interfaz muestra “sin lectura reciente (últimos 30 días)”.

## Auditoría

- `cliente_id`: cliente operativo del dispositivo afectado; satisface
  `auditoria_cliente_id_fkey`.
- `usuario_id`: actor interno cuando corresponda.
- `actor_tipo`: columna explícita `VARCHAR(30) NOT NULL DEFAULT 'tenant'`;
  `platform_admin` identifica una acción global.
- El servicio de auditoría enmascara `usuario_id`, username, email y nombre en las
  respuestas tenant cuando `actor_tipo = platform_admin`.
- `accion`, `entidad`, `entidad_id`, `detalle`, `timestamp`.
- Vista tenant: actor renderizado como “Administración de la plataforma”; no expone
  email, username ni nombre del `platform_admin`.
- Nunca contiene secretos, hashes, tokens, contraseñas ni credenciales MQTT.

## Migraciones y seed

- La migración agrega `clientes.es_plataforma BOOLEAN NOT NULL DEFAULT false` de
  forma segura y repetible.
- La migración agrega `auditoria.actor_tipo VARCHAR(30) NOT NULL DEFAULT 'tenant'`
  de forma segura y repetible.
- El seed local encuentra la fila `es_plataforma = true`, la crea si no existe y
  garantiza que el usuario `platform_admin` apunte a ella sin duplicar registros.
- Los listados y filtros excluyen por `es_plataforma`, nunca por `nombre`.

## Transiciones

1. Fabricado → reclamado sin enrolar: ocurre fuera de esta feature.
2. Reclamado sin enrolar → enrolado: ocurre mediante el enrolamiento existente.
3. Enrolado → reclamado sin enrolar: reset desde panel; conserva `reclamado_en`.
4. Reset repetido: permanece reclamado sin enrolar y devuelve `already_reset`.
