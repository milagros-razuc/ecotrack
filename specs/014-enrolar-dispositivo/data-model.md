# Data Model: Enrolamiento seguro

## `dispositivos_fabrica`

| Campo | Tipo | Reglas |
|---|---|---|
| `device_id` | `varchar(50)` | PK, coincide con el identificador de dispositivo |
| `factory_secret_hash` | `varchar(64)` | SHA-256 hexadecimal, único, nunca secreto en claro |
| `created_at` | `timestamptz` | alta del export de fábrica |
| `enrolled_at` | `timestamptz` | nullable; se fija al completar el enrolamiento |

## `dispositivos`

| Campo/relación | Regla para esta feature |
|---|---|
| `codigo` | corresponde a `device_id` |
| `cliente_id` | lo determina el reclamo previo del dashboard; nunca el body del endpoint |
| `token_reclamo_hash` | se consume/nullifica solo en el reclamo existente |
| `reclamado_en` | debe existir para aceptar el enrolamiento |

## Identidad dynamic-security

| Entidad | Valores |
|---|---|
| Cliente | `ecotrack-<device_id lowercase>` |
| Rol | `role-<device_id>` |
| Publish ACL | `publishClientSend ecotrack/<device_id>/lecturas allow` |
| Subscribe ACL | deny `ecotrack/#` priority 0; allow `ecotrack/<device_id>/#` priority 10 |

## Estados

`factory_pending -> claimed -> mqtt_provisioned -> enrolled`.

Un error de validación vuelve a `factory_pending` o conserva `claimed` sin
credenciales entregadas. Un error de MQTT no puede avanzar a `mqtt_provisioned`; un error de persistencia
dispara compensación y, si esta falla, deja un log sanitizado en stderr para
resolución manual.

## Entrega

La respuesta exitosa contiene `device_id`, `mqtt_user`, `mqtt_pass` y
`mqtt_host`/`mqtt_port` solo una vez. `mqtt_host` usa `MQTT_PUBLIC_HOST`, el
hostname visible para la placa, y no el nombre interno de Compose `mosquitto`.
No se persiste `mqtt_pass` recuperable ni se incluyen secretos en auditoría,
logs o respuestas posteriores. Una compensación fallida solo deja un log
sanitizado en stderr para resolución manual; no crea un incidente persistido.
