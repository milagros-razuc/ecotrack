# Trazabilidad de pruebas unitarias

Fecha de ejecución: 2026-10-31.

Los estados de esta tabla reflejan únicamente la ejecución observada del
subconjunto unitario trazable. Un CP-ID con al menos un `TODO` queda como
`Pendiente`, aunque tenga otros casos aprobados.

| CP-ID | Requisito | Archivo de test | Cantidad de tests | Estado |
|---|---|---|---:|---|
| CP-RF01 | Capturar temperatura, humedad y luminosidad de forma continua con sensores conectados al ESP32. | [pending-gaps.test.js](../backend/src/test/pending-gaps.test.js) | 1 | Pendiente |
| CP-RF02 | Permitir configurar el intervalo de captura. | [brechas-conocidas.test.js](../backend/src/test/brechas-conocidas.test.js) | 1 | Pendiente |
| CP-RF03 | El dispositivo transmite los datos automáticamente al backend por WiFi. | [pending-gaps.test.js](../backend/src/test/pending-gaps.test.js) | 1 | Pendiente |
| CP-RF04 | El backend valida formato y coherencia de lo recibido y rechaza o registra lo que no cumple. | [schemas.test.js](../backend/src/test/schemas.test.js), [mqtt-handler.test.js](../backend/src/test/mqtt-handler.test.js) | 39 | Aprobado |
| CP-RF05 | Almacenar los datos en base estructurada, asociados al cliente y al dispositivo. | [lecturas.test.js](../backend/src/test/lecturas.test.js), [mqtt-handler.test.js](../backend/src/test/mqtt-handler.test.js) | 8 | Aprobado |
| CP-RF06 | Mostrar en tiempo real los valores actuales en un dashboard accesible desde cualquier navegador. | [pending-gaps.test.js](../backend/src/test/pending-gaps.test.js) | 1 | Pendiente |
| CP-RF07 | Consultar el historial por rango de fechas y por variable. | [lecturas.test.js](../backend/src/test/lecturas.test.js), [brechas-conocidas.test.js](../backend/src/test/brechas-conocidas.test.js) | 9 | Pendiente |
| CP-RF08 | Configurar umbrales máximo y mínimo por variable. | [umbrales.test.js](../backend/src/test/umbrales.test.js) | 5 | Pendiente |
| CP-RF09 | Generar alertas automáticas al superar o bajar de los umbrales. | [alertas.test.js](../backend/src/test/alertas.test.js) | 7 | Pendiente |
| CP-RF10 | Notificar alertas activas con un pop-up dentro del dashboard. | [brechas-conocidas.test.js](../backend/src/test/brechas-conocidas.test.js) | 1 | Pendiente |
| CP-RF11 | Registrar un log de alertas (variable, valor, umbral, fecha y hora) y permitir gestionar su estado. | [alertas.test.js](../backend/src/test/alertas.test.js) | 4 | Aprobado |
| CP-RF12 | Gestionar dispositivos (alta, baja y modificación) asociados a un cliente. | [dispositivos.test.js](../backend/src/test/dispositivos.test.js) | 2 | Aprobado |
| CP-RF13 | Panel de control con estado de dispositivos, alertas activas y resumen, del cliente del usuario. | [dispositivos.test.js](../backend/src/test/dispositivos.test.js) | 2 | Pendiente |
| CP-RF14 | Registrar logs de actividad para auditoría y trazabilidad. | [brechas-conocidas.test.js](../backend/src/test/brechas-conocidas.test.js) | 1 | Pendiente |
| CP-RF15 | Configuración inicial del WiFi de cada ESP32 mediante un portal cautivo SoftAP temporal, accesible desde una app o página móvil, sin reprogramar el firmware por unidad. | [pending-gaps.test.js](../backend/src/test/pending-gaps.test.js) | 1 | Pendiente |
| CP-RF16 | El admin crea, modifica y elimina cuentas dentro de su cliente, asignando rol. | [usuarios.test.js](../backend/src/test/usuarios.test.js) | 4 | Aprobado |
| CP-RF17 | Las funciones administrativas se restringen a usuarios admin. | [rol.test.js](../backend/src/test/rol.test.js), [usuarios.test.js](../backend/src/test/usuarios.test.js) | 8 | Aprobado |
| CP-RF18 | Cada dispositivo se asocia a un cliente; cada usuario ve y opera solo sobre lo de su cliente. | [cliente-aislamiento.test.js](../backend/src/test/cliente-aislamiento.test.js), [auth.test.js](../backend/src/test/auth.test.js), [alertas.test.js](../backend/src/test/alertas.test.js), [lecturas.test.js](../backend/src/test/lecturas.test.js), [dispositivos.test.js](../backend/src/test/dispositivos.test.js) | 13 | Pendiente |
| CP-RF19 | API pública documentada para sistemas externos autorizados (lecturas, alertas, estado de dispositivos). | [brechas-conocidas.test.js](../backend/src/test/brechas-conocidas.test.js) | 1 | Pendiente |
| CP-RF20 | Cada usuario ve y edita su perfil, incluido el cambio de contraseña. | [auth.test.js](../backend/src/test/auth.test.js), [brechas-conocidas.test.js](../backend/src/test/brechas-conocidas.test.js) | 7 | Pendiente |
| CP-RF21 | Aprovisionar y reclamar dispositivos mediante un token único de un solo uso; la baja los libera sin borrar su histórico. | [dispositivos.test.js](../backend/src/test/dispositivos.test.js) | 10 | Pendiente |
| CP-RF22 | Continuar capturando lecturas sin conexión al broker, conservando hasta 360 lecturas en un buffer volátil y publicándolas al recuperar la conexión. | [pending-gaps.test.js](../backend/src/test/pending-gaps.test.js) | 1 | Pendiente |
| CP-RF23 | Aceptar un timestamp de captura opcional en las lecturas, conservarlo para el histórico y procesar las lecturas diferidas según su atraso. | [lecturas.test.js](../backend/src/test/lecturas.test.js) | 6 | Pendiente |
| CP-RE01–CP-RE06 | Requisitos de eficiencia y diseño; requieren medición, integración o pruebas fuera del alcance unitario. | [pending-gaps.test.js](../backend/src/test/pending-gaps.test.js) | 6 | Pendiente |

## Detalle contractual

La columna `Cantidad de tests` resume los `describe`/`it` cuyo nombre contiene
el CP-ID indicado. La modalidad es `Unitaria` para los archivos de esta tabla,
`Fuera de alcance` cuando no existe prueba backend aplicable, e
`Integración existente` para las suites no incluidas en el subconjunto. No se
registran estados asumidos ni métricas no observadas; los motivos de los casos
pendientes están documentados en cada archivo enlazado y en la sección de
hallazgos.

| CP-ID | Test | Modalidad | Motivo |
|---|---|---|---|
| CP-RF01–CP-RF03 | PENDIENTE | Fuera de alcance | Requiere firmware, hardware o WiFi. |
| CP-RF04–CP-RF05 | Describe/it con CP-ID | Unitaria | Casos observados aprobados. |
| CP-RF06 | PENDIENTE | Fuera de alcance | Requiere UI y tiempo real integrado. |
| CP-RF07–CP-RF14 | Describe/it con CP-ID | Unitaria | Incluye TODOs explícitos donde corresponde. |
| CP-RF15 | PENDIENTE | Fuera de alcance | Requiere portal cautivo y firmware. |
| CP-RF16–CP-RF21 | Describe/it con CP-ID | Unitaria | Incluye TODOs explícitos donde corresponde. |
| CP-RF22 | PENDIENTE | Fuera de alcance | Requiere integración MQTT/firmware. |
| CP-RF23 | Describe/it con CP-ID | Unitaria | Incluye TODOs de timestamp no soportado. |
| CP-RE01–CP-RE06 | PENDIENTE | Fuera de alcance | Requiere medición o integración específica. |

## Salida real del runner

### Suite configurada completa

Comando ejecutado desde `backend/`:

```text
npm.cmd test
```

Salida final observada:

```text
1..175
# tests 175
# pass 121
# fail 6
# cancelled 0
# skipped 16
# todo 32
```

Los seis fallos observados fueron suites de integración que abortaron por
`TEST_DATABASE_URL es obligatorio`: `aislamiento-historico-dispositivo`,
`api-keys-auditoria`, `continuidad-lecturas`, `historico-fechas`, `realtime` y
`trazabilidad-alertas`.

### Subconjunto unitario trazable

Comando ejecutado:

```text
node --test --test-timeout=30000 --test-concurrency=1 src/test/schemas.test.js src/test/alertas.test.js src/test/umbrales.test.js src/test/lecturas.test.js src/test/dispositivos.test.js src/test/usuarios.test.js src/test/auth.test.js src/test/rol.test.js src/test/cliente-aislamiento.test.js src/test/mqtt-handler.test.js src/test/brechas-conocidas.test.js src/test/pending-gaps.test.js
```

Salida final observada:

```text
1..138
# tests 138
# pass 106
# fail 0
# cancelled 0
# skipped 0
# todo 32

### Cobertura diagnóstica

Comando ejecutado desde la raíz con `--prefix backend`:

```text
npm.cmd --prefix .\backend run test:coverage
```

Salida final observada:

```text
# tests 175
# pass 121
# fail 6
# skipped 16
# todo 32
```

La cobertura se conserva únicamente como diagnóstico; no se usa ningún
porcentaje para aprobar requisitos.
```

## Hallazgos

- La suite configurada incluye pruebas de integración que requieren
  `TEST_DATABASE_URL`; sin esa variable terminaron seis subtests con fallo.
- RF07 mantiene pendiente el uso correcto de `fechaDesde`/`fechaHasta` en el
  histórico agregado.
- RF08 tiene pendientes los rechazos de `min >= max` directamente en el servicio.
- RF13 no tiene caracterizado el borde exacto de 120 segundos con un reloj de
  PostgreSQL real.
- RF18 tiene pendientes la transferencia concurrente y la consulta inicial de
  umbrales sin `cliente_id` en la misma sentencia.
- RF21 tiene pendientes la respuesta de ruta para token ausente, la decisión de
  atomicidad como `UPDATE` directo y la transacción explícita en rechazos.

## Cubierto solo parcialmente por unitarias

La lista manual/integración queda remitida a:

- T044–T045 de [tasks.md](../specs/011-suite-pruebas-unitarias/tasks.md), para
  RF15 y los requisitos de firmware, hardware, UI, carga e integración.
- Los seis subtests de integración fallidos por falta de `TEST_DATABASE_URL`
  indicados en la salida real anterior.
- RF10, RF14 y RF19, que conservan `test.todo` en
  [brechas-conocidas.test.js](../backend/src/test/brechas-conocidas.test.js) y
  requieren validación de dashboard, auditoría de API keys y API pública.
- CP-RE01–CP-RE06, que no se aprueban con estas pruebas unitarias y requieren
  mediciones o pruebas de integración específicas.
