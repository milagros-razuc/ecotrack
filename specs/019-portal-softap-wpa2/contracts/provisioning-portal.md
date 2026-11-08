# Contract: Portal de provisión SoftAP (019)

| Estado/acción | Resultado observable |
|---|---|
| Inicio del portal | Red `EcoTrack-Setup-<MAC>` protegida por WPA2 con el código compartido `EcoTrack.123`. |
| Asociación con otra clave | El cliente no puede asociarse. |
| Asociación con `EcoTrack.123` y visita a `http://192.168.4.1/` | Aparece directamente el formulario WiFi, sin PIN. |
| POST de configuración válida a `/save` | Comienza la prueba de conexión vigente. |
| Conexión completada o timeout | Se conservan los cierres actuales del SoftAP. |

El código es público y compartido: no excluye a quien lo conozca. El HTTP local no usa TLS; WPA2 cifra el enlace de radio, no la conexión hasta el navegador ni el procesamiento dentro del ESP32.
