# Tasks: Resetear credenciales de un dispositivo

## Phase 1 - Tests

- [ ] T001 Añadir tests de autorización admin y aislamiento por `cliente_id`.
- [ ] T002 Añadir tests de transición `dispositivos_fabrica.enrolled_at` a NULL conservando el reclamo.
- [ ] T003 Añadir tests de eliminación del cliente, rol y tres ACL con doble Dynamic Security.
- [ ] T004 Añadir tests de compensación para cada fallo parcial y de errores sanitizados.
- [ ] T005 Verificar que los tests existentes de enrolamiento no se modifican ni regresan.

## Phase 2 - Backend

- [ ] T006 Implementar la operación administrativa en la capa de rutas, servicio y adaptador existente.
- [ ] T007 Implementar la transición transaccional del estado local sin agregar `enrolled_at` a `dispositivos`.
- [ ] T008 Implementar compensación explícita ante fallos de Dynamic Security o persistencia.
- [ ] T009 Aplicar autorización, aislamiento y respuestas de error sanitizadas.

## Phase 3 - Validation

- [ ] T010 Ejecutar tests desde el host con Node >= 20 y base `ecotrack_test`.
- [ ] T011 Revisar diff para confirmar que enrolamiento, reclamo y Dynamic Security existentes no fueron alterados fuera del adaptador necesario.
- [ ] T012 Actualizar README y documentación de API con el reset y sus límites.
