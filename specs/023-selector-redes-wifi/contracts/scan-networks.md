# Contract: Escaneo de redes del portal ESP32

## Solicitud

`GET /networks` inicia o completa el escaneo solicitado por el portal. No requiere parámetros ni transmite credenciales.

## Respuesta propuesta

| Resultado | HTTP | Cuerpo JSON | Comportamiento del portal |
|---|---:|---|---|
| Escaneo completado con redes | 200 | `{"networks":["SSID A","SSID B"]}` | Reemplazar las opciones visibles y habilitar selección. |
| Escaneo completado sin SSID visibles | 200 | `{"networks":[]}` | Informar que no se encontraron redes; conservar entrada manual. |
| Escaneo no disponible por transición de conexión | 409 | `{"error":"scan_unavailable"}` | Informar que no se puede buscar en ese momento; conservar entrada manual. |
| Error del escaneo | 503 | `{"error":"scan_failed"}` | Informar el error de búsqueda y conservar entrada manual. |

## Reglas

- La lista contiene SSID no vacíos, deduplicados y con el límite de cantidad vigente.
- El portal no debe borrar el SSID ya escrito/seleccionado ni la contraseña al refrescar resultados.
- La interfaz no inicia conexión WiFi al elegir un SSID. Solo `POST /save` inicia el flujo existente.
- Las respuestas de error no deben reportar falsamente “búsqueda completada sin resultados”.
