# Tasks: Resetear credenciales de un dispositivo

## Phase 1 - Tests

- [X] T001 Añadir tests de autorización admin y aislamiento por `cliente_id`.
- [X] T002 Añadir tests de transición `dispositivos_fabrica.enrolled_at` a NULL conservando el reclamo.
- [X] T003 Añadir tests de eliminación del cliente, rol y tres ACL con doble Dynamic Security.
- [X] T004 Añadir tests de compensación para cada fallo parcial y de errores sanitizados.
- [X] T005 Verificar que los tests existentes de enrolamiento no se modifican ni regresan.
- [X] T013 Añadir tests de idempotencia: dispositivo ya reseteado como no-op seguro y
      dispositivo nunca reclamado rechazado sin llamadas a Dynamic Security.
- [ ] T014 (Firmware separado, no implementar en 016 backend) Añadir tests del
      re-enrolamiento posterior tras N rechazos MQTT consecutivos, distinguiendo
      credenciales rechazadas de broker caído o sin red.
- [X] T015 Cambiar los tests del adaptador dynsec para inyectar mensajes MQTT con el
      sobre real `responses[]`, `command`, `error` y `correlationData`, incluyendo
      éxito, entidad inexistente y error no tolerable.
- [X] T016 Añadir tests de orden y compensación por etapa: bloqueo/validación local,
      eliminación dynsec, rollback local antes de confirmar y diagnóstico sanitizado
      si falla la confirmación posterior a dynsec.

## Phase 2 - Backend

- [X] T006 Implementar la operación administrativa en la capa de rutas, servicio y adaptador existente.
- [X] T007 Implementar la transición transaccional del estado local sin agregar `enrolled_at` a `dispositivos`.
- [X] T008 Implementar compensación explícita ante fallos de Dynamic Security o persistencia.
- [X] T009 Aplicar autorización, aislamiento y respuestas de error sanitizadas.
- [X] T017 Definir e implementar la semántica idempotente para estado reclamado sin
      enrolar, y el rechazo sin efectos para dispositivos nunca reclamados.
- [ ] T018 (Firmware separado, no implementar en 016 backend) Implementar la
      recuperación ante credenciales MQTT invalidadas, sin borrar identidad/secreto
      de fábrica ni generar token nuevo.
- [X] T019 Documentar y respetar el orden dynsec/base local y el límite de compensación
      cuando una confirmación local falla después de borrar recursos dynsec.

## Phase 3 - Validation

- [ ] T010 Ejecutar tests desde el host con Node >= 20 y base `ecotrack_test`.
- [X] T011 Revisar diff para confirmar que enrolamiento, reclamo y Dynamic Security existentes no fueron alterados fuera del adaptador necesario.
- [ ] T012 Actualizar README y documentación de API con el reset y sus límites.
- [X] T020 Verificar explícitamente que la implementación no modifica rutas, servicios
      ni tests existentes de enrolamiento o reclamo.
