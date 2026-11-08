# Quickstart: Validar portal SoftAP WPA2

Esta guía describe la aceptación manual en hardware; no se ha ejecutado en esta tarea.

## Requisitos previos

- ESP32 con firmware actualizado.
- Teléfono o computadora con WiFi.

## Escenarios

1. Arrancar el ESP32 sin credenciales WiFi del sitio guardadas.
2. Comprobar que aparece `EcoTrack-Setup-<sufijo>` con seguridad WPA2.
3. Intentar asociarse con una clave incorrecta; debe fallar.
4. Asociarse con `EcoTrack.123` y visitar `http://192.168.4.1/`; debe aparecer directamente el formulario sin PIN.
5. Introducir una red de prueba y observar el flujo vigente de conexión y cierre del SoftAP.
6. Verificar que los registros NVS antiguos con `softApPass` siguen arrancando, porque el firmware nuevo ignora ese campo.

Registrar versión de firmware, asociación correcta/incorrecta, resultado del portal, conexión a la red y cierre del SoftAP. No incluir credenciales WiFi del sitio en capturas o informes.
