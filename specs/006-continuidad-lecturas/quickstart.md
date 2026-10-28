# Quickstart: Continuidad de lecturas y fecha de captura

## Prerrequisitos

- Docker y Docker Compose disponibles para PostgreSQL y Mosquitto TLS.
- Dependencias instaladas en `backend/`.
- `TEST_DATABASE_URL` apunta a una base PostgreSQL separada cuyo nombre termina en `_test` o
  comienza por `hardening_`.
- Certificados y credenciales de prueba de la spec 005 disponibles.
- Para validación manual: ESP32 configurado con `esp32Secret.h` local, no versionado.

## Pruebas automatizadas del backend

Desde `backend/`:

```powershell
npm test
```

La prueba específica de continuidad debe ejecutarse con el mismo runner:

```powershell
node --test --test-timeout=30000 --test-concurrency=1 src/test/continuidad-lecturas.integration.test.js
```

Debe cubrir:

1. `ts` ausente, válido, exactamente en límites y fuera de límites.
2. Descarte anterior a `reclamado_en` y de dispositivo sin propietario.
3. Reciente frente a diferida, sin alertas ni eventos para la segunda.
4. `ultima_conexion` con recepción y última lectura por captura.
5. Orden, agregado y partición mensual de una lectura del mes anterior.
6. Compatibilidad con el payload sin `ts`.

Las pruebas usan `TEST_DATABASE_URL`, fixtures aislados y el broker TLS de la spec 005 cuando
validan el flujo MQTT completo. No deben omitir pruebas; si Docker no está disponible, solo se
pueden marcar como omitidas las pruebas de infraestructura que ya sigan esa convención.

## Verificación manual del firmware

1. Compilar y cargar el sketch con NTP/TLS de la spec 005 y el intervalo por defecto.
2. Confirmar una lectura normal con `ts` en el broker/base.
3. Cortar WiFi o detener el broker durante varios minutos mientras la placa sigue encendida.
4. Confirmar que el nodo continúa capturando y que el buffer no excede 360 entradas.
5. Restablecer WiFi/broker y observar que se publican las lecturas FIFO, con `mqtt.loop()`
   atendido durante el vaciado, y luego las lecturas normales.
6. Consultar PostgreSQL: las lecturas recuperadas deben conservar `timestamp` original y orden
   cronológico; no deben existir alertas ni eventos Socket.IO para atrasos mayores de cinco
   minutos.
7. Reiniciar la placa durante un corte y confirmar que las lecturas previas al reinicio no
   reaparecen.

La prueba de hardware no es automatizable en esta fase y debe quedar registrada como evidencia
manual de aceptación.
