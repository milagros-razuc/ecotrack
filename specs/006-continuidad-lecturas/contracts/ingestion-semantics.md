# Contrato de ingesta y consultas

## Ingesta MQTT

1. Parsear JSON y validar `lecturaMqttSchema`.
2. Capturar una sola hora de recepción.
3. Resolver dispositivo activo, dueño y `reclamado_en`.
4. Descartar si no hay dueño o si la fecha de captura es anterior a `reclamado_en`.
5. Rechazar `ts` fuera del rango permitido.
6. Insertar con fecha de captura y actualizar `ultima_conexion` con recepción.
7. Si el atraso es mayor de cinco minutos, detener el flujo sin alertas, umbrales ni Socket.IO.
8. En caso reciente, emitir `lectura` y evaluar las tres variables con la lógica existente.

Los descartes y errores se registran con el mecanismo existente. Ningún rechazo puede producir
una lectura persistida ni efectos derivados.

## Consultas

- `GET /api/lecturas` y `GET /api/public/lecturas`: ordenan por `lecturas.timestamp`, que es la
  fecha de captura.
- `GET /api/lecturas/ultima`: selecciona una lectura por dispositivo con el mayor
  `timestamp`; una diferida no reemplaza una posterior.
- `GET /api/lecturas/agregado`: filtra y agrupa por `lecturas.timestamp`.
- La API pública mantiene el aislamiento por `cliente_id` obtenido de API key.

No se agregan endpoints ni parámetros nuevos en esta spec.
