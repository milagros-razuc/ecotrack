# Contrato MQTT seguro

## Transporte

- Los clientes operativos se conectan a `mqtts://<host>:8883`.
- Mosquitto presenta un certificado de servidor firmado por la CA privada del entorno.
- El cliente valida la cadena contra la CA configurada y el nombre/IP contra SAN.
- Una CA ausente, incorrecta, un certificado vencido o un hostname no incluido en SAN
  rechaza la conexión.
- No existe fallback operativo a MQTT sin TLS en `1883`.

## Identidad y ACL

- Se conservan usuarios y contraseñas MQTT existentes.
- `backend` puede leer `ecotrack/+/lecturas`.
- Cada usuario de dispositivo puede publicar únicamente en
  `ecotrack/<su-deviceId>/lecturas`.
- La autenticación TLS no reemplaza ni amplía la ACL.

## Mensajes

- El tópico y payload permanecen compatibles con el contrato vigente:
  `{"temperatura": number, "humedad": number, "luminosidad": number}`.
- Backend valida el payload antes de persistirlo.

## Buffer del dispositivo

- Las lecturas sin conexión quedan pendientes en FIFO hasta la capacidad configurada.
- El reenvío ocurre antes de nuevas lecturas.
- Una publicación fallida conserva la cabeza del buffer.
- Al llenarse, se descarta la lectura más antigua.
- El buffer se pierde al reiniciar el ESP32.
