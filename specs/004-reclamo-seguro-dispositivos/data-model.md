# Data Model: Reclamo seguro y aprovisionamiento de dispositivos

## Dispositivo

Tabla existente `dispositivos`, extendida con:

| Campo | Tipo | Reglas |
|---|---|---|
| `codigo` | `VARCHAR(50)` | Identificador único usado por MQTT y por el reclamo |
| `cliente_id` | `INTEGER NULL` | Dueño actual; `NULL` significa sin dueño |
| `activo` | `BOOLEAN` | `false` mientras no tenga dueño; `true` después de un reclamo válido |
| `nombre` | `VARCHAR(100) NULL` | Se limpia en la baja |
| `ubicacion` | `VARCHAR(100) NULL` | Se limpia en la baja |
| `token_reclamo_hash` | `VARCHAR(64) NULL` | Hash SHA-256 del token del ciclo actual; nunca el token en claro |
| `reclamado_en` | `TIMESTAMPTZ NULL` | Fecha/hora del reclamo exitoso del ciclo actual |
| `creado_en` | `TIMESTAMPTZ` | Fecha de creación del registro |
| `ultima_conexion` | `TIMESTAMPTZ NULL` | Última actividad MQTT conocida |

### Estados y transiciones

1. **Aprovisionado**: `cliente_id = NULL`, `activo = false`, configuración vacía, hash de token nuevo y `reclamado_en = NULL`.
2. **Reclamado**: `cliente_id = administrador.cliente_id`, `activo = true`, configuración asignable y `reclamado_en` establecido; el token queda consumido según la regla de ciclo.
3. **Liberado**: `cliente_id = NULL`, `activo = false`, nombre/ubicación nulos, sin umbrales, token anterior inválido y `token_reclamo_hash = NULL`.
4. **Habilitado para reclamar**: el operador ejecuta `--rotate`, se genera un hash nuevo y se imprime el token una sola vez; luego un administrador puede iniciar otro ciclo sin modificar filas históricas.

## Token de reclamo

- Secreto de alta entropía generado únicamente por aprovisionamiento o baja.
- El valor en claro se devuelve una sola vez al operador del aprovisionamiento y no se persiste.
- La validación recibe `codigo` y token; calcula el hash y exige coincidencia.
- La unicidad y el consumo se garantizan mediante la operación atómica de reclamo.
- La baja deja el hash nulo; el token anterior no puede reclamar un dispositivo ya liberado o reclamado.

## Lectura y alerta

- `lecturas.cliente_id` y `alertas.cliente_id` representan el cliente dueño en el instante de generación.
- Ambos campos son inmutables durante baja o transferencias.
- Un mensaje MQTT con dispositivo sin dueño no crea ninguna de las dos entidades.
- `alertas.valor`, `alertas.umbral_min` y `alertas.umbral_max` se normalizan a `DECIMAL(6,2)` preservando valores existentes mediante conversión explícita.

## Umbral

- Pertenece a un `dispositivo_codigo` y se elimina cuando el dispositivo queda liberado.
- Los seeds solo pueden crear umbrales para dispositivos con `cliente_id` no nulo.

## Auditoría

- Registra `cliente_id`, usuario, acción, entidad, código del dispositivo y detalle.
- Acciones mínimas: `aprovisionar_dispositivo`, `reclamar_dispositivo`, `baja_dispositivo`.
- Nunca contiene el token ni su hash.

## Integridad y concurrencia

- `dispositivos.codigo` conserva unicidad.
- El reclamo usa el conflicto por `codigo` y una condición de dispositivo sin dueño más hash coincidente.
- Una respuesta sin filas actualizadas representa rechazo y no debe modificar ninguna propiedad del dispositivo.
