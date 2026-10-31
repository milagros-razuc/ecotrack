---
description: "Tareas de implementaciÃ³n de la suite de pruebas unitarias trazables"
---

# Tasks: Suite de pruebas unitarias trazables

**Input**: Design documents from `/specs/011-suite-pruebas-unitarias/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, `quickstart.md`

**Tests**: La feature solicita explÃ­citamente pruebas unitarias y tests pendientes
trazables; las tareas de test forman parte de cada mÃ³dulo.

## Organization

Las tareas siguen el orden modular solicitado: helpers, schemas, middleware, alertas,
lecturas, dispositivos, usuarios, MQTT, brechas conocidas y trazabilidad. Las etiquetas
`[US1]`, `[US2]` y `[US3]` vinculan cada tarea con las historias de la especificaciÃ³n:

- **US1**: verificar reglas de negocio.
- **US2**: distinguir cobertura aprobada y brechas.
- **US3**: mantener pruebas reproducibles y seguras.

## Phase 1: Setup

**Purpose**: Preparar el runner existente y las dependencias de desarrollo sin introducir
un runner alternativo.

- [X] T001 Actualizar `backend/package.json` para conservar `node --test` en `test` y agregar `test:coverage` con el mecanismo de cobertura compatible con Node.js 18 (CP-RE01, CP-RE02, CP-RE03, CP-RE04, CP-RE05, CP-RE06)
- [ ] T002 Actualizar `backend/package-lock.json` Ãºnicamente si se agrega `supertest` como devDependency para probar rutas Express en proceso (CP-RF17, CP-RF18)
- [ ] T003 [P] Crear el directorio `backend/src/test/helpers/` y documentar en `backend/src/test/helpers/README.md` que ningÃºn helper puede abrir red, Docker, PostgreSQL, MQTT real ni hardware (CP-RF18, CP-RE01)

## Phase 2: Foundational

**Purpose**: Construir dobles y fixtures compartidos que bloquean la implementaciÃ³n segura
de todos los mÃ³dulos.

- [ ] T004 Implementar el doble de pool y cliente transaccional en `backend/src/test/helpers/mock-db.js`, registrando `query`, `connect`, `BEGIN`, `COMMIT`, `ROLLBACK` y `release` sin conexiÃ³n real (CP-RF12, CP-RF21, CP-RF18)
- [ ] T005 [P] Implementar fixtures deterministas en `backend/src/test/helpers/fixtures.js` con clientes A y B, un admin y un usuario comÃºn por cliente, dispositivos, lecturas, alertas y umbrales separados por `cliente_id` (CP-RF18)
- [ ] T006 [P] Implementar el doble MQTT en `backend/src/test/helpers/mock-mqtt.js` con eventos `connect`, `subscribe`, `message` y `error`, sin invocar el paquete MQTT real (CP-RF04, CP-RF05, CP-RF09, CP-RF23)
- [ ] T007 [P] Implementar el reloj controlado en `backend/src/test/helpers/clock.js` para timestamps de recepciÃ³n, corte de dos minutos y atraso de cinco minutos sin depender de la hora del sistema (CP-RF13, CP-RF23)
- [ ] T008 [P] Crear utilidades de carga aislada de mÃ³dulos en `backend/src/test/helpers/module-mocks.js` para interceptar `config/db.js` y dependencias antes de importar servicios (CP-RF18, CP-RE01)
- [ ] T009 Crear `backend/src/test/helpers/isolation.test.js` con CP-RF18 y CP-RE01 para verificar que los dobles no abren sockets, procesos Docker, conexiones PG/MQTT ni dispositivos fÃ­sicos

**Checkpoint**: Los helpers pueden ejecutar un escenario de dos clientes y observar
consultas, transacciones, emisiones y tiempos sin servicios externos.

## Phase 3: Schemas y RF04

**Goal**: Validar payloads de entrada con casos felices, borde y error.

**Independent Test**: Ejecutar `backend/src/test/schemas.test.js` sin red ni base de datos
y verificar resultados de Zod y mensajes de error.

- [X] T010 [P] [US1] Crear `backend/src/test/schemas.test.js` con `describe`/`it` nombrados CP-RF04 para payload vÃ¡lido, malformado, incompleto, fuera de rango, tipos incorrectos, `NaN` y strings
- [ ] T011 [US1] Agregar en `backend/src/test/schemas.test.js` casos CP-RF08 para rechazar `umbralMin >= umbralMax`, aceptar lÃ­mites vÃ¡lidos y validar variable/notificaciones
- [ ] T012 [US1] Agregar en `backend/src/test/schemas.test.js` casos CP-RF11, CP-RF16 y CP-RF20 para estados, comentarios, usuarios y perfil conforme a los esquemas existentes

## Phase 4: Middleware rol y cliente

**Goal**: Verificar autorizaciÃ³n por rol y rechazo de tokens sin cliente.

**Independent Test**: Ejecutar middleware con `req`, `res` y `next` dobles, y verificar
401/403 sin importar la aplicaciÃ³n completa.

- [ ] T013 [P] [US1] Crear `backend/src/test/rol.test.js` con CP-RF17 para permitir roles autorizados, rechazar roles no permitidos con 403 y rechazar ausencia de usuario con 401
- [X] T014 [P] [US1] Crear `backend/src/test/cliente.test.js` con CP-RF18 para extraer `clienteId` vÃ¡lido y rechazar con 401 tokens sin `clienteId`
- [X] T015 [US3] Verificar en `backend/src/test/cliente.test.js` CP-RF18 que `clienteId` nunca se tome de parÃ¡metros, body o query de la solicitud

## Phase 5: Alertas y umbrales

**Goal**: Cubrir umbrales, motor de alertas, estados, filtros y paginaciÃ³n.

**Independent Test**: Ejecutar servicios con pool/transacciones falsos y fixtures de
clientes A y B; comprobar consultas, emisiones y ausencia de efectos cruzados.

- [X] T016 [P] [US1] Crear `backend/src/test/umbrales.test.js` con CP-RF08 para alta/actualizaciÃ³n, mÃ­nimo mayor o igual al mÃ¡ximo, dispositivo inexistente y notificaciones activas/inactivas
- [X] T017 [P] [US1] Crear `backend/src/test/alertas.test.js` con CP-RF09 para valor dentro, igual al mÃ­nimo, igual al mÃ¡ximo, debajo, sobre el mÃ¡ximo y `notificaciones_activas=false`
- [X] T018 [US1] Ampliar `backend/src/test/alertas.test.js` con CP-RF11 para transiciÃ³n pendiente-atendida y atendida-pendiente, comentario, repeticiÃ³n sin auditorÃ­a nueva, filtros y paginaciÃ³n
- [X] T019 [US1] Ampliar `backend/src/test/alertas.test.js` con CP-RF18 usando alertas de clientes A y B para demostrar listado, obtenciÃ³n y modificaciÃ³n exclusivamente dentro del cliente autenticado
- [X] T020 [US3] Verificar en `backend/src/test/alertas.test.js` CP-RF09 y CP-RF11 que una alerta sin cliente propietario no persiste, no audita y no emite eventos

## Phase 6: Lecturas y timestamps

**Goal**: Cubrir asociaciÃ³n histÃ³rica, agregaciÃ³n y timestamps diferidos.

**Independent Test**: Ejecutar servicios de lecturas con pool falso, fechas deterministas y
datos de dos clientes; verificar parÃ¡metros SQL y resultados sin PostgreSQL.

- [X] T021 [P] [US1] Crear `backend/src/test/lecturas.test.js` con CP-RF05 para guardar lecturas asociadas a dispositivo y cliente, y rechazar lecturas de dispositivos sin propietario
- [X] T022 [US1] Ampliar `backend/src/test/lecturas.test.js` con CP-RF23 para conservar `ts` vÃ¡lido, usar hora de recepciÃ³n cuando `ts` falta o es invÃ¡lido y respetar lÃ­mites futuro/pasado
- [X] T023 [US1] Ampliar `backend/src/test/lecturas.test.js` con CP-RF07 para agregaciÃ³n dÃ­a por hora, semana/mes por dÃ­a, promedio, mÃ­nimo y mÃ¡ximo
- [X] T024 [US1] Agregar en `backend/src/test/lecturas.test.js` el caso pendiente CP-RF07 que documente explÃ­citamente la brecha de `fechaDesde`/`fechaHasta` en histÃ³rico, sin marcarlo aprobado
- [X] T025 [US1] Ampliar `backend/src/test/lecturas.test.js` con CP-RF18 para listar, agregar y obtener Ãºltimas lecturas de clientes A y B sin exposiciÃ³n cruzada
- [X] T026 [US3] Verificar en `backend/src/test/lecturas.test.js` CP-RF05 y CP-RF23 que lecturas diferidas conservan timestamp, no interpolan datos y no generan efectos fuera de su cliente

## Phase 7: Dispositivos y tokens

**Goal**: Cubrir alta, baja lÃ³gica, reclamo de un solo uso y estados de conexiÃ³n.

**Independent Test**: Ejecutar `dispositivos.service.js` con doble transaccional y reloj
controlado, verificando hash, atomicidad y estados.

- [X] T027 [P] [US1] Crear `backend/src/test/dispositivos.test.js` con CP-RF12 para aprovisionar, listar, actualizar y dar de baja lÃ³gicamente sin borrar histÃ³rico
- [X] T028 [US1] Ampliar `backend/src/test/dispositivos.test.js` con CP-RF21 para hash SHA-256, token de un solo uso, reclamo exitoso, token invÃ¡lido/repetido y error 409 genÃ©rico equivalente en rechazos
- [X] T029 [US1] Ampliar `backend/src/test/dispositivos.test.js` con CP-RF13 para nunca conectado, online antes de dos minutos, exactamente dos minutos y offline despuÃ©s del corte
- [X] T030 [US1] Verificar en `backend/src/test/dispositivos.test.js` CP-RF18 que listar, reclamar, actualizar y eliminar no permiten operar sobre dispositivos del cliente B desde cliente A
- [ ] T031 [US3] Verificar en `backend/src/test/dispositivos.test.js` CP-RF21 que fallos de reclamo y baja ejecutan rollback, no cambian estado y liberan el cliente transaccional

## Phase 8: Usuarios y autenticaciÃ³n

**Goal**: Cubrir usuarios, roles, perfil, contraseÃ±as y sesiones.

**Independent Test**: Ejecutar servicios y middleware con bcrypt/JWT controlados y pool
falso, sin autenticar contra servicios externos.

- [X] T032 [P] [US1] Crear `backend/src/test/usuarios.test.js` con CP-RF16 para listar, crear, actualizar y eliminar usuarios dentro del cliente autenticado
- [X] T033 [US1] Ampliar `backend/src/test/usuarios.test.js` con CP-RF16 y CP-RF17 para no eliminar al Ãºltimo admin, no degradar al Ãºnico admin y permitir la operaciÃ³n cuando existe otro admin
- [X] T034 [P] [US1] Crear `backend/src/test/auth.test.js` con CP-RF20 para login vÃ¡lido, credenciales incorrectas con error genÃ©rico, perfil y cambio de contraseÃ±a con hash y nueva versiÃ³n de token
- [X] T035 [US1] Ampliar `backend/src/test/auth.test.js` con CP-RF18 para tokens con cliente A/B y rechazo de sesiones invalidadas o sin cliente asociado
- [X] T036 [US3] Verificar en `backend/src/test/auth.test.js` CP-RF16, CP-RF17 y CP-RF20 que contraseÃ±as y JWT no revelen secretos ni permitan escalamiento de rol

## Phase 9: Handler MQTT

**Goal**: Cubrir ingesta, validaciÃ³n, asociaciÃ³n, alertas y eventos con dobles MQTT/DB.

**Independent Test**: Ejecutar `procesarMensaje` con cliente MQTT falso, pool falso,
fixtures, reloj controlado y `io` falso; no iniciar broker ni leer certificados reales.

- [X] T037 [P] [US1] Crear `backend/src/test/mqtt-handler.test.js` con CP-RF04 para JSON invÃ¡lido y payloads rechazados por esquema sin guardar ni alertar
- [X] T038 [US1] Ampliar `backend/src/test/mqtt-handler.test.js` con CP-RF05 y CP-RF23 para dispositivo/cliente, timestamp vÃ¡lido, timestamp ausente, diferido y timestamp fuera de rango
- [X] T039 [US1] Ampliar `backend/src/test/mqtt-handler.test.js` con CP-RF09 y CP-RF18 para umbral, alerta, evento en la sala del cliente correcto y ausencia de emisiÃ³n a cliente B
- [X] T040 [US3] Verificar en `backend/src/test/mqtt-handler.test.js` CP-RF04 y CP-RF23 que dispositivo sin dueÃ±o, dado de baja o lectura anterior al reclamo no persisten ni emiten eventos

## Phase 10: Tests pendientes de brechas conocidas

**Goal**: Registrar explÃ­citamente defectos o funcionalidades no implementadas sin
convertirlas en aprobaciones falsas.

- [X] T041 [P] [US2] Crear tests `test.todo` o `test.skip` en `backend/src/test/pending-gaps.test.js` para CP-RF02 con motivo "intervalo de captura dependiente de compilaciÃ³n"
- [X] T042 [P] [US2] Crear tests `test.todo` o `test.skip` en `backend/src/test/pending-gaps.test.js` para CP-RF14 con motivo "no existen eventos de API keys"
- [X] T043 [P] [US2] Crear tests `test.todo` o `test.skip` en `backend/src/test/pending-gaps.test.js` para CP-RF19 con motivo "API pÃºblica pendiente"
- [X] T044 [P] [US2] Crear tests `test.todo` o `test.skip` en `backend/src/test/pending-gaps.test.js` para CP-RF15 con motivo "portal SoftAP pendiente"
- [X] T045 [US2] Agregar en `backend/src/test/pending-gaps.test.js` entradas CP-RF01, CP-RF03, CP-RF06, CP-RF10, CP-RF22 y CP-RE01 a CP-RE06 como Pendiente o Fuera de alcance cuando requieran firmware, hardware, UI, carga o integraciÃ³n, con motivo especÃ­fico y sin inventar mÃ©tricas

## Phase 11: Documento de trazabilidad

**Goal**: Entregar el mapa completo CP-ID â†’ requisito â†’ archivo â†’ test â†’ estado.

- [X] T046 [US2] Crear `docs/trazabilidad-unitarias.md` con una fila para cada requisito RF01-RF23 y RE01-RE06, incluyendo CP-ID, archivo, nombre exacto, modalidad, estado Aprobado/Fallido/Pendiente y motivo cuando corresponda (CP-RF01, CP-RF23, CP-RE01)
- [X] T047 [US2] Actualizar `docs/trazabilidad-unitarias.md` despuÃ©s de cada ejecuciÃ³n para no declarar aprobados tests no ejecutados y reflejar fallos reales de producciÃ³n (CP-RE01)
- [X] T048 [US2] Revisar `docs/trazabilidad-unitarias.md` contra `specs/011-suite-pruebas-unitarias/contracts/traceability-report.md` y verificar que no existan estados "Asumido", filas sin CP-ID o porcentajes inventados (CP-RE01)

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Validar el conjunto completo sin modificar producciÃ³n para ocultar defectos.

- [X] T049 [P] Ejecutar `npm test` desde `backend/` sin Docker, red, PostgreSQL, MQTT ni hardware y registrar el resultado real en `docs/trazabilidad-unitarias.md` (CP-RE01)
- [X] T050 [P] Ejecutar `npm run test:coverage` desde `backend/` y conservar la salida como diagnÃ³stico, sin usar porcentajes como aprobaciÃ³n de requisitos (CP-RE01)
- [ ] T051 Ejecutar la suite completa dos veces con las mismas entradas y comparar que los resultados sean reproducibles en `backend/src/test/` (CP-RE01)
- [ ] T052 Ejecutar las validaciones del `quickstart.md` y confirmar que todos los nombres de tests contienen CP-RFxx o CP-REyy (CP-RE01)
- [ ] T053 Revisar los cambios de producciÃ³n y documentar cualquier defecto pendiente en `docs/trazabilidad-unitarias.md` (CP-RE01)

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: sin dependencias; prepara scripts y estructura.
- **Phase 2 Foundational**: depende de Setup y bloquea los mÃ³dulos de pruebas.
- **Phases 3-9**: dependen de los helpers de Phase 2. Pueden ejecutarse en paralelo por
  mÃ³dulo una vez disponibles los dobles.
- **Phase 10**: puede comenzar despuÃ©s de Setup, pero su consolidaciÃ³n depende de conocer
  los mÃ³dulos y brechas verificadas.
- **Phase 11**: depende de la definiciÃ³n de todos los CP-ID de Phases 3-10.
- **Phase 12**: depende de todas las fases anteriores.

### User Story Dependencies

- **US1**: Phase 2 â†’ Phases 3-9; entrega la cobertura funcional principal y es el MVP.
- **US2**: Phase 10 â†’ Phase 11; depende de los nombres/estados reales de los tests.
- **US3**: Phase 2 â†’ Phases 3-9 y Phase 12; transversal a cada mÃ³dulo.

### Parallel Execution Examples

```text
# DespuÃ©s de Phase 2:
T010 (schemas) || T013-T015 (middleware) || T016-T020 (alertas)
|| T021-T026 (lecturas) || T027-T031 (dispositivos)
|| T032-T036 (usuarios/auth) || T037-T040 (MQTT)

# Brechas conocidas:
T041 || T042 || T043 || T044

# ValidaciÃ³n final:
T049 || T050
```

## Implementation Strategy

1. **MVP**: completar Phase 1, Phase 2 y los mÃ³dulos de schemas, middleware, alertas,
   lecturas, dispositivos, usuarios y MQTT (Phases 3-9) con CP-ID y aislamiento.
2. **Transparencia**: registrar inmediatamente las brechas conocidas en Phase 10, sin
   corregir producciÃ³n silenciosamente.
3. **Trazabilidad**: consolidar el reporte de Phase 11 con estados reales, incluyendo todos
   RF01-RF23 y RE01-RE06.
4. **Cierre**: ejecutar las validaciones de Phase 12 y conservar evidencia reproducible.









