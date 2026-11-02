# Baseline de pendientes EcoTrack

**Fecha de revisión:** 2026-11-02  
**Base de código:** `main` en `3bf99ac` (revisada desde `codex/baseline-requisitos`)  
**Propósito:** inventario de planificación para reconciliar la tesis, la matriz, las specs y el estado observado del repositorio antes de implementar. No reemplaza la tesis ni declara cumplimiento académico.

## Criterio de lectura

- **Abierto:** falta funcionalidad o una decisión necesaria para implementarla.
- **Parcial:** existe una parte, pero hay una brecha funcional o de contrato.
- **Implementado; falta evidencia:** el código está, pero el criterio requiere una prueba que todavía no se registró aquí.
- **Reconciliar:** el código parece cubrirlo y el pendiente documental es obsoleto o describe una capa equivocada.
- **Decisión:** el alcance o el criterio no está suficientemente definido para planificar implementación.

La tesis `PROYECTO FINAL DE SISTEMAS-ECOTRACK.md` (31/10/2026) se toma como baseline normativa por la instrucción de planificación previa. Antes de cambiar requisitos, toda diferencia con la matriz del 29/10 y `docs/requisitos.md` debe quedar resuelta explícitamente.

## Funcionalidad y seguridad

| Requisito / tema | Estado observado | Evidencia para planificar | Siguiente paso y dependencia |
|---|---|---|---|
| **RF03 / RF15 — conexión y aprovisionamiento MQTT** | **Parcial; bloqueo de extremo a extremo.** TLS/CA existe, pero la conexión normal del firmware no pasa credenciales mientras Mosquitto prohíbe conexiones anónimas. Las ACL actuales cubren lecturas y un dispositivo. | `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino` (rutas normales de `mqtt.connect`); `mosquitto/config/acl.conf`; `mosquitto/config/mosquitto.conf`; Spec Kit `specs/005-asegurar-canal-mqtt/` y `specs/010-endurecer-provisionamiento-wifi/`. | Especificar credenciales de entrega, ACL por dispositivo y criterio de aceptación física. **Bloquea la entrega segura de RF02** y debe coordinarse con cualquier trabajo activo de Mili en firmware/ACL/aprovisionamiento.
| **RF02 — intervalo desde dashboard** | **Abierto.** El periodo de captura sigue siendo constante de compilación (10 s); no hay flujo MQTT de configuración. | `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino` (constante `INTERVALO_CAPTURA_MS`); tesis, sección 5.2.1. | Especificar valor deseado/reportado, persistencia en PostgreSQL y NVS, versión, rechazo, reconexión y estado del dashboard. La propuesta conversada usa MQTT, pero faltan rango y unidad. Depende de RF03/15 y sus ACL.
| **RF07 — rango de fechas del histórico** | **Reconciliar.** El backend aplica `fechaDesde` y `fechaHasta`; la matriz aún lo marca pendiente. | `backend/src/services/lecturas.service.js`; `backend/src/schemas.js`; `frontend/historico.html`. | Actualizar CP-RF07 y la matriz usando evidencia actual. No volver a planificar como defecto del backend si la revisión confirma la implementación.
| **Paginación del histórico** | **Abierto.** El frontend manda página y límite, pero la API/servicio no implementa offset ni total paginado. | `frontend/historico.html`; `backend/src/routes/lecturas.js`; `backend/src/services/lecturas.service.js`. | Acordar contrato de respuesta y criterio de página vacía/total; planificar frontend y backend en la misma feature.
| **RF08 — validación de umbrales** | **Reconciliar.** `min < max` se valida en el schema HTTP; no hace falta duplicarlo en el servicio. | `backend/src/schemas.js`, `umbrales.service.js`; reporte de la rama 011. | Cambiar el criterio/tarea obsoleta que exige validación en el servicio y actualizar trazabilidad.
| **RF11 / RF14 — auditoría de alertas y API keys** | **Implementado; revisar trazabilidad.** El historial de acciones de alerta y auditoría de API keys existen. | `backend/src/services/alerta-acciones.service.js`; `backend/src/routes/alertas.js`; `backend/src/routes/apiKeys.routes.js`; `frontend/auditor.html`. | Retirar TODOs obsoletos y verificar casos de aceptación. No confundir historial visible al volver a iniciar sesión con una notificación enviada fuera de la app.
| **RF10 — avisos con la aplicación cerrada** | **Decisión; abierto si se incluye en el alcance.** El dashboard recibe eventos por Socket.IO mientras la sesión está activa; no se identificó canal externo. | `frontend/index.html`; `backend/src/realtime/`. | Definir si se necesita email, push u otro medio, destinatarios y comportamiento offline antes de especificar implementación.
| **RF12 — modificación de dispositivo** | **Abierto.** Hay reclamo y baja, pero no ruta para editar nombre/ubicación. | `backend/src/routes/dispositivos.js`; `backend/src/services/dispositivos.service.js`. | Definir campos editables, rol, tenant, auditoría y validación antes de crear spec.
| **RF18 — aislamiento y transferencia histórica** | **Parcial; revisar seguridad y concurrencia.** Las consultas históricas podrían asociar metadata actual del dispositivo a un cliente anterior; ingesta y transferencia requieren prueba de carrera. | `backend/src/services/lecturas.service.js`; `backend/src/mqtt/client.js`; `specs/003-aislamiento-historico-dispositivo/`. | Precisar qué metadata histórica debe persistir y cómo serializar/validar reclamo concurrente. La carrera requiere evidencia con PostgreSQL real.
| **RF19 — API pública** | **Parcial; contrato por confirmar.** API key, revocación, aislamiento y límites existen. El listado público de dispositivos no calcula el estado que sí ofrece la ruta privada. | `backend/src/routes/public.routes.js`; `backend/src/middleware/apiKey.js`; `backend/src/services/dispositivos.service.js`; `backend/src/middleware/rateLimiter.js`. | Confirmar si RF19 exige estado calculado; cubrir claves inválidas/revocadas y tenant con integración; documentar endpoints vigentes.
| **RF21 — token de reclamo** | **Implementado; falta evidencia de concurrencia real.** La ruta rechaza token ausente con 409 y el servicio consume el hash. | `backend/src/routes/dispositivos.js`; `backend/src/services/dispositivos.service.js`; prueba unitaria de rama 011. | Corregir TODO de token ausente. Si se exige atomicidad frente a dos reclamos concurrentes, probarlo en PostgreSQL; una `Map` o mock no cierra ese criterio.
| **RF22 — buffer de 360 lecturas** | **Implementado en RAM; falta aceptación física.** Al llenarse, descarta la más antigua; el reinicio pierde el buffer volátil. | `codigo-esp32-mosquitto/ReadingBuffer.h`; `codigo-esp32-mosquitto/codigo-esp32-mosquitto.ino`; matriz CP-RF22. | Probar corte, recuperación, orden, saturación y reinicio en placa; registrar pérdidas y confirmar que la volatilidad coincide con el requisito.
| **RF23 — timestamp opcional** | **Lógica implementada; reconciliar tests/documentación.** Si no hay `ts`, backend usa hora de recepción; timestamps inválidos/futuros/antiguos se rechazan. | `backend/src/mqtt/client.js`; `backend/src/services/lecturas.service.js`; tesis, sección 5.2.2. | Alinear los casos CP-RF23 con la política real. No describir timestamp inválido como fallback.
| **RNF21 — límites de tasa** | **Decisión de baseline.** El código usa límites por IP/usuario en login y por cliente/IP en API; la tesis, `docs/requisitos.md` y la matriz no coinciden plenamente. | `backend/src/middleware/rateLimiter.js`; secciones RNF21 de tesis y `docs/requisitos.md`. | Acordar criterio normativo y actualizar requisito, diseño y pruebas juntos antes de evaluar conformidad.

## Pruebas, eficiencia y documentación

| Tema | Estado observado | Siguiente paso |
|---|---|---|
| **Rama 011 — pruebas unitarias** | La rama `origin/011-pruebas-unitarias-backend` no forma parte de `main`. Su reporte consigna 138 pruebas en el subconjunto (106 pass, 32 TODO) y 175 en la suite (121 pass, 6 fail, 16 skip, 32 TODO); los seis fallos de integración se atribuyen a la falta de `TEST_DATABASE_URL`. Algunos motivos/TODO ya son obsoletos frente al código de `main`. | Reconciliar la rama y su reporte contra el baseline antes de integrar o repetir resultados. La ejecución completa dos veces depende del entorno de BD. Conservar evidencia separada para cada modalidad; una prueba unitaria no demuestra hardware ni RE.
| **RE01–RE06 — carga, latencia, memoria y escala** | **Sin evidencia formal de aceptación.** La matriz y la tesis discrepan; RE01 de la tesis usa 50 nodos cada 10 s, no 30 s. RE05 requiere RAM ≤60% y soak test de 24 h; RE06 compara 10× carga con degradación ≤25%. | Congelar criterios según la tesis, instrumentar entorno/casos y registrar resultados observados; no declarar cumplimiento sin mediciones.
| **Capítulo 6 — pruebas y resultados** | **Abierto.** Tiene encabezados/plantilla, pero no ejecución, resultados por requisito, defectos ni evidencias. | Completar después de estabilizar baseline y ejecutar pruebas; no rellenar resultados anticipados.
| **Capítulos 7–9 y revisión editorial** | **Abierto en parte.** Se observan placeholders en 7–8, una instrucción de APA en 9 y anchors incorrectos en el índice; VAN/TIR sí aparecen en la tesis. | Completar lo que corresponda al documento final; revisar cálculos y supuestos económicos por la devolución docente, sin tratar VAN/TIR como ausentes. Verificar numeración, referencias, diagramas y flecha MQTT/backend contra el contenido actual.
| **Portal de aprovisionamiento / Spec 010** | **Comportamiento parcialmente resuelto.** SoftAP se crea abierto, el portal exige PIN y el AP se apaga tras guardar configuración válida. Los cierres por timeout, BOOT y seguridad deben tener evidencia física. La lista `tasks.md` de 010 conserva tareas no marcadas y texto de alcances previos. | Alinear `spec.md`, `tasks.md`, README y quickstart con la revisión 1A y registrar aceptación en placas; aclarar qué significaba “quitar la contraseña” antes de cambiar el PIN.

## Decisiones que bloquean specs nuevas

1. **Credenciales de dispositivo:** definir cómo se emiten/instalan en la configuración de entrega y qué identidad usa Mosquitto por dispositivo.
2. **RF02:** fijar rango/unidad del intervalo y estados visibles para solicitado, aplicado, rechazado y pendiente.
3. **Avisos RF10:** confirmar si el alcance incluye notificaciones externas y cuál canal.
4. **RF19:** confirmar si la API pública debe devolver estado online/offline calculado.
5. **RNF21 y RE01–RE06:** resolver diferencias de criterios usando el baseline normativo acordado.

## Orden de trabajo recomendado

1. Validar este inventario y fijar los criterios normativos.
2. Crear/revisar la spec de autenticación MQTT, aclarar credenciales y ACL, y aprobar `spec.md`, `plan.md` y `tasks.md` antes de código.
3. Implementar autenticación/ACL en una fase aislada y validar con broker y hardware.
4. Especificar e implementar RF02 después de estabilizar el contrato MQTT.
5. Atender RF18, paginación y RF12 en specs separadas; resolver RF19 y RF10 según las decisiones de alcance.
6. Ejecutar aceptación física, integración y carga; actualizar trazabilidad y completar el capítulo 6 con evidencia.

**Verificación de esta revisión:** solo inspección de archivos y código; no se ejecutaron pruebas ni se modificó lógica de producto.
