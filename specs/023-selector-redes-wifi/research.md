# Research: Selección de redes WiFi en el portal ESP32

## Estado actual inspeccionado

- `SetupPortalPage.h` usa un `<input list="networks">` con `<datalist>` y carga el endpoint `/networks` al abrir la página y al pulsar “Buscar redes cercanas”.
- `SetupPortal.cpp` ejecuta `WiFi.scanNetworks(false, true)`, omite SSID vacíos, deduplica por nombre, devuelve hasta 20 SSID y responde `[]` con HTTP 409 mientras se conecta a WiFi/MQTT.
- La interfaz no comprueba `response.ok` antes de interpretar JSON, no distingue una respuesta HTTP 409 de un escaneo vacío y depende del comportamiento nativo del `datalist` para mostrar sugerencias.
- No se encontró en los archivos inspeccionados evidencia de una captura de hardware/navegador que determine si el origen del reporte es fallo del escaneo o presentación de opciones.

## Decisiones de diseño propuestas

| Tema | Decisión | Motivo |
|---|---|---|
| Control de opciones | Usar una lista desplegable explícita y mantener un campo editable para SSID manual | El usuario reporta que no ve las redes en el selector; `datalist` puede no presentarse como una lista visible en algunos navegadores. |
| Estados | Distinguir carga, resultados, cero resultados y error/no disponible | El estado actual convierte algunos fallos en una lista vacía que parece una búsqueda exitosa sin redes. |
| Persistencia y conexión | Mantener selección como dato del formulario; conectar y guardar solo al enviar `/save` | Preserva el contrato de aprovisionamiento existente. |
| Seguridad y ciclo de vida | Mantener Feature 019 sin cambios | El problema reportado es la búsqueda/presentación de SSID. |
| Alcance de nombres | Mantener deduplicación, límite actual y entrada manual para redes no listadas | Evita rediseñar el escaneo de radio sin evidencia de que sea necesario. |

## Pendiente para implementación

Confirmar durante la verificación física si el endpoint devuelve SSID en la placa afectada. Si devuelve `[]` pese a redes visibles, revisar el resultado negativo/diagnóstico de `WiFi.scanNetworks` y la compatibilidad del modo de radio. Si el endpoint devuelve nombres pero el control no los presenta, el cambio de interfaz satisface la causa observada.
