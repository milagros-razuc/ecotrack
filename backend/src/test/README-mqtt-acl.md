# Test de ACL MQTT

`mqtt-acl.integration.test.js` verifica que un dispositivo solo puede publicar
en su propio tópico, usando un broker Mosquitto descartable con TLS.

## Prerrequisitos

1. Docker en ejecución. Si no está disponible, el test se omite.
2. Certificados generados (no están en el repo):

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\generate-mqtt-certs.ps1 -HostIp <IP-del-host>
   ```

3. `mosquitto/config/passwd.test` (ignorado por git), con los usuarios
   `backend`, `test-a` y `test-b` y una clave de prueba:

   ```powershell
   docker run --rm -v ${PWD}/mosquitto/config:/cfg eclipse-mosquitto:2 sh -c "mosquitto_passwd -b -c /cfg/passwd.test backend testpass123 && mosquitto_passwd -b /cfg/passwd.test test-a testpass123 && mosquitto_passwd -b /cfg/passwd.test test-b testpass123"
   ```

## Cómo funciona

- Levanta un contenedor efímero en el puerto `18883` (no toca el broker real
  en `8883`) con `mosquitto.test.conf`, `acl.test.conf` y `passwd.test`.
- Copia la config dentro del contenedor, ajusta dueño y permisos y reescribe
  las rutas, porque Mosquitto abre `passwd` con un usuario sin privilegios.
- Se conecta por `mqtts://localhost:18883` validando la CA
  (`rejectUnauthorized: true`).

## Criterio de ausencia

MQTT no devuelve error al publicar en un tópico sin permiso: el broker
descarta el mensaje en silencio. Por eso el test se suscribe como `backend`,
publica con `test-a` en su tópico (debe llegar) y en el de `test-b` (no debe
llegar tras esperar ~2 s), y no afirma ningún error de `publish()`.