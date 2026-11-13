# Quickstart: Verificar el selector de redes WiFi

## Aceptación reportada

El 2026-11-13, el usuario confirmó: “Listo, quedó funcionando”. No se especificaron el modelo de placa ni el navegador/dispositivo cliente.

## Preparación

1. Cargar en un ESP32 el firmware con identidad de fábrica ya preparada.
2. Entrar en modo provisión e iniciar el SoftAP según `specs/019-portal-softap-wpa2/quickstart.md`.
3. Asociar un teléfono o computadora al SoftAP y abrir `http://192.168.4.1/`.
4. Tener al alcance al menos una red WiFi visible y, si es posible, otra red oculta para comprobar la entrada manual.

## Verificación funcional

1. Abrir el portal y comprobar el estado inicial de búsqueda.
2. Confirmar que los SSID detectados aparecen en el selector explícito sin depender de sugerencias del teclado/browser.
3. Elegir una red y comprobar que el campo SSID muestra el valor seleccionado.
4. Escribir un SSID manualmente y comprobar que no queda bloqueado por las opciones detectadas.
5. Actualizar la búsqueda y comprobar que se mantienen el SSID y la contraseña ya ingresados.
6. Repetir en una ubicación sin SSID visibles y verificar el estado vacío.
7. Verificar respuesta de error/no disponible y comprobar que no se presenta como búsqueda vacía.
8. Enviar `/save` con datos válidos y confirmar que el flujo de conexión y cierre del SoftAP se mantiene según Feature 019.

Registrar modelo de placa, versión del core Arduino-ESP32, navegador/dispositivo cliente, resultado HTTP, SSID detectados (sin registrar contraseñas) y resultado observado.
