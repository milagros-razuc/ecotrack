# Research: Selección de redes WiFi en el portal ESP32

## Baseline inspeccionado antes de la implementación

- Antes del cambio, `SetupPortalPage.h` usaba un `<input list="networks">` con `<datalist>` y cargaba el endpoint `/networks` al abrir la página y al pulsar “Buscar redes cercanas”.
- Antes del cambio, `SetupPortal.cpp` ejecutaba `WiFi.scanNetworks(false, true)`, omitía SSID vacíos, deduplicaba por nombre, devolvía hasta 20 SSID y respondía `[]` con HTTP 409 mientras se conectaba a WiFi/MQTT.
- La interfaz anterior no comprobaba `response.ok` antes de interpretar JSON, no distinguía una respuesta HTTP 409 de un escaneo vacío y dependía del comportamiento nativo del `datalist` para mostrar sugerencias.
- No se encontró en los archivos inspeccionados evidencia de una captura de hardware/navegador que determine si el origen del reporte es fallo del escaneo o presentación de opciones.

## Decisiones aprobadas para esta implementación

| Tema | Decisión | Motivo |
|---|---|---|
| Control de opciones | Usar una lista desplegable explícita y mantener un campo editable para SSID manual | El usuario reporta que no ve las redes en el selector; `datalist` puede no presentarse como una lista visible en algunos navegadores. |
| Estados | Distinguir carga, resultados, cero resultados y error/no disponible | El estado actual convierte algunos fallos en una lista vacía que parece una búsqueda exitosa sin redes. |
| Persistencia y conexión | Mantener selección como dato del formulario; conectar y guardar solo al enviar `/save` | Preserva el contrato de aprovisionamiento existente. |
| Seguridad y ciclo de vida | Mantener Feature 019 sin cambios | El problema reportado es la búsqueda/presentación de SSID. |
| Alcance de nombres | Mantener deduplicación, límite actual y entrada manual para redes no listadas | Evita rediseñar el escaneo de radio sin evidencia de que sea necesario. |

## Resultado de implementación y validación pendiente

La interfaz ahora presenta un selector explícito y conserva el campo manual. El endpoint devuelve un objeto con `networks`, distingue 409 `scan_unavailable` y 503 `scan_failed`, y la página informa estados separados del estado de conexión.

Durante la verificación física confirmar que el endpoint devuelve SSID en la placa afectada. Si devuelve una lista vacía pese a redes visibles, registrar la placa, core Arduino-ESP32, bandas/configuración de las redes y navegador; revisar el resultado real de `WiFi.scanNetworks` y el modo de radio antes de ampliar el alcance.
