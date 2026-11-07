# Specification Quality Checklist: Auto-recuperación y versión de firmware

**Purpose**: Validar completitud y calidad de la especificación 017.
**Created**: 2026-11-04
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No hay marcadores de aclaración pendientes.
- [x] La spec está enfocada en recuperación operativa, trazabilidad y seguridad.
- [x] Se separan firmware, backend, autenticación, persistencia y OTA.
- [x] Se documentan las restricciones NVS, particiones y TLS.

## Requirement Completeness

- [x] El umbral exacto N=3 de rechazos está definido.
- [x] N=3 para borrar credenciales y el máximo de 3 re-enrolamientos por hora son
  parámetros distintos, con constantes distintas.
- [x] Se distinguen autenticación rechazada y fallos de conectividad.
- [x] Solo cuentan CONNACK de autenticación y se exige un intervalo mínimo de 30 segundos.
- [x] El intervalo y `mqtt_reenroll_window_start` usan epoch sincronizado por NTP;
  sin hora válida no se cuentan rechazos, no se re-enrola ni se borran credenciales,
  y se reintenta la sincronización.
- [x] `mqtt_auth_reject_count` se reinicia tras conexión MQTT y re-enrolamiento
  exitosos.
- [x] Se enumera exactamente qué se borra y qué se conserva en NVS.
- [x] Se limita el re-enrolamiento a tres intentos por hora con backoff definido.
- [x] Los contadores y el inicio de ventana tienen claves NVS propias, sobreviven a
  reinicios y no modifican identidad ni secreto de fábrica.
- [x] Se define el comportamiento ante reinicio, reintento y backoff.
- [x] Se define el reporte MQTT autenticado, con `device_id` tomado del tópico, y el
  campo opcional `fw` dentro de lecturas, incluyendo longitud y formato; un `fw`
  inválido se descarta sin perder la lectura.
- [x] Se exige que el reporte corresponda al dispositivo autenticado dueño del `device_id`.
- [x] Se cubren aislamiento por cliente y ausencia de secretos.
- [x] Firmware viejo se muestra como "desconocida" sin error.
- [x] Se cubre la prueba extremo a extremo con el reset de la spec 016.
- [x] Se cubre compatibilidad con firmware antiguo y OTA gradual.
- [x] Se documenta el reinicio ante eventos no concluyentes y su efecto en redes
  inestables.
- [x] Se incluye un plan de tests primero contra `ecotrack_test`, con persistencia,
  fecha y aislamiento por cliente.
- [x] Se incluye verificación en placa del CONNACK real de Mosquitto después del
  reset de credenciales de la spec 016, registrando resultado y estado pendiente.
- [x] Se incluyen trazabilidad con RF/RNF/RI existentes.

## Feature Readiness

- [x] Los escenarios principales son independientes y verificables.
- [x] Los criterios de éxito son medibles.
- [x] Los límites de alcance excluyen cambios innecesarios en reclamo y enrolamiento.
- [x] No se implementó código como parte de esta spec.

## Notes

- La ejecución real de tests y la verificación en placa quedan pendientes; la tabla
  de la spec registra explícitamente el resultado real y el estado de cada caso.
