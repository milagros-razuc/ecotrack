# Contrato: comportamiento del portal de configuración

## Estado y cierre

| Evento | Respuesta observable |
|---|---|
| Arranque sin configuración válida | SoftAP WPA2 activo con clave de fábrica; portal disponible. |
| BOOT sostenido >= 3 s en equipo configurado | SoftAP WPA2 activo; portal disponible temporalmente. |
| Configuración inválida | HTTP de error, mensaje visible y portal sigue activo. |
| WiFi/MQTT/TLS confirmados y perfil guardado | Estado de éxito, `WiFi.softAPdisconnect(true)`, modo estación y portal inactivo. |
| 10 min sin actividad de configuración válida | Portal inactivo y SoftAP apagado. |

## Compatibilidad MQTT

- Transporte: TLS en puerto `8883`.
- Identidad: `device_id` de fábrica.
- Tópico de lecturas: `ecotrack/<deviceId>/lecturas`.
- Payload: JSON actual con `temperatura`, `humedad`, `luminosidad` y `ts` cuando corresponda.
- ACL: cada dispositivo conserva su usuario/tópico propio; la feature no cambia Mosquitto ni el backend.
