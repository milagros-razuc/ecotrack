# Quickstart de validación

Esta guía valida el alcance mínimo de la feature. No reemplaza los pasos de instalación
generales del README.

## Prerrequisitos

- Docker Compose, OpenSSL y Node.js/npm disponibles.
- Dos usuarios MQTT de prueba y sus entradas ACL.
- Un CA público de desarrollo en el repositorio y claves privadas locales ignoradas.
- Backend y Mosquitto configurados con `MQTT_PORT=8883` y `MQTT_CA_PATH`.

## 1. Generar certificados locales

Generar una CA autofirmada y un certificado del broker firmado por ella, incluyendo SAN
para el nombre usado por el backend (`mosquitto`) y la dirección usada por el ESP32.
Guardar claves privadas fuera del control de versiones. El CA público debe quedar en la
ruta documentada por el proyecto.

## 2. Levantar el entorno TLS

```powershell
docker compose up --build
```

Esperar el healthcheck de PostgreSQL y el log del backend indicando conexión y suscripción
MQTT. La conexión debe usar `8883`; no se considera válida una ejecución sobre `1883`.

## 3. Ejecutar la prueba de ACL

```powershell
Set-Location backend
npm test -- --test-name-pattern "ACL|MQTT"
```

Resultado esperado:

- Publicación de A en su tópico: el backend recibe/procesa la lectura.
- Publicación de A en el tópico de B: el broker la descarta y el backend no recibe ni
  persiste el mensaje.
- La prueba no depende de que MQTT 3.1.1 devuelva un error al publicador.

## 4. Validar rechazo de CA

Iniciar el backend o un cliente de prueba con una ruta de CA incorrecta, ausente o
incompatible. Resultado esperado: el handshake falla, se registra el error y no se
procesan lecturas. Repetir con la CA correcta y confirmar la conexión.

## 5. Validar buffer del ESP32

1. Arrancar el ESP32 con la CA embebida y una hora obtenida por NTP.
2. Interrumpir MQTT durante menos de la capacidad configurada.
3. Confirmar que las lecturas se acumulan en RAM.
4. Restaurar conectividad y observar el reenvío FIFO antes de nuevas lecturas.
5. Forzar más lecturas que la capacidad: confirmar que se descartan las más antiguas.
6. Reiniciar el ESP32 durante una interrupción: documentar que el buffer RAM se pierde.

## 6. Validar documentación

Comprobar que el diagrama y README indican TLS/8883, CA, SAN, NTP, buffer circular,
descarte de lecturas antiguas y ausencia de persistencia del buffer tras reinicio. TLS
no debe permanecer en la lista de pendientes.
