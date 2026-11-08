# Data Model: Proteger portal SoftAP con WPA2

## Identidad de fábrica

| Campo NVS | Tipo | Regla |
|---|---|---|
| `deviceId` | string | Requerido; identidad estable individual. |
| `serverHost` | string | Requerido; hostname/IP validado existente. |
| `deviceSecret` | string | Requerido; secreto reservado existente. |
| `setupPin` | — | Retirado del modelo activo y de fabricación. |
| `softApPass` | — | No es leído ni generado por el firmware nuevo; un valor antiguo en NVS se ignora. |

## Código compartido

- Valor: `EcoTrack.123`.
- Alcance: todos los dispositivos del proyecto.
- Clasificación: público, no secreto, no individual.
- Función: contraseña WPA2 del SoftAP mientras el portal está activo.
- Efecto de conocimiento: quien conoce el código puede asociarse y enviar solicitudes HTTP al portal.

## Sesión del portal

1. `inactive`: no hay SoftAP disponible.
2. `active`: WPA2 SoftAP con código compartido y formulario HTTP.
3. `connecting`: configuración candidata recibida y conexión del sitio en validación.
4. `completed` / `expired`: cierre del SoftAP tras configuración confirmada o vencimiento del timeout vigente.
