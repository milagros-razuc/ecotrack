# Research: Suite de pruebas unitarias trazables

## Decisión 1: Mantener `node:test` como runner

- **Decision**: Usar el runner nativo ya configurado en `backend/package.json` y ampliar el
  script `test` para incluir los archivos unitarios; agregar `test:coverage` con la
  herramienta disponible en Node sin introducir otro framework.
- **Rationale**: La constitución exige usar el runner existente en `backend/src/test`.
  La suite actual ya usa `node:test` en varios archivos, por lo que cambiar de runner
  aumentaría riesgo y contradicción con el repositorio.
- **Alternatives considered**: Jest, Vitest y Mocha fueron descartados por agregar un
  runner paralelo y requerir migración de configuración.

## Decisión 2: Supertest solo para rutas Express

- **Decision**: Agregar `supertest` como devDependency únicamente si los tests de rutas
  necesitan verificar status, payload y middleware sobre `app` sin escuchar un puerto.
- **Rationale**: `backend/package.json` no lo declara y las rutas se montan sobre la app
  exportada por `src/app.js`. Supertest permite pruebas HTTP en proceso sin red, Docker ni
  PostgreSQL real; no reemplaza `node:test`.
- **Alternatives considered**: `fetch` requiere un servidor escuchando y se usa hoy en
  pruebas de integración; mocks manuales de `req/res` se reservarán para middleware puro.

## Decisión 3: Aislamiento de PostgreSQL, MQTT y reloj

- **Decision**: Interceptar `src/config/db.js` antes de importar servicios, siguiendo el
  precedente de `usuarios.service.test.js`, y exponer dobles de `query`, `connect`,
  `BEGIN/COMMIT/ROLLBACK` y `release`. El MQTT se sustituirá antes de cargar
  `mqtt/client.js`; el tiempo se controlará con el reloj de `node:test` cuando esté
  disponible en Node 18 y con argumentos de fecha ya soportados por los handlers.
- **Rationale**: Los servicios importan el pool al cargar el módulo y las transacciones
  requieren observar atomicidad. `procesarMensaje` ya acepta `recibidaEn`, lo que permite
  probar timestamp, atraso y corte sin depender del reloj del sistema.
- **Alternatives considered**: PostgreSQL/Mosquitto en Docker se descartan por ser
  integración; librerías de fake timers se descartan para no agregar otra dependencia
  si el runtime existente permite el control requerido.

## Decisión 4: Fixtures deterministas de aislamiento

- **Decision**: Crear fixtures compartidos con cliente A y cliente B, cada uno con admin y
  usuario común, dispositivos y lecturas/alertas separables por `cliente_id`.
- **Rationale**: La constitución exige al menos dos clientes para cada requisito de
  aislamiento. Los fixtures evitan que cada archivo construya datos incompletos o use
  IDs cruzados.
- **Alternatives considered**: Fixtures globales mutables y datos de integración se
  descartan por contaminación entre tests y dependencia de servicios reales.

## Decisión 5: Estado de brechas y cobertura

- **Decision**: El reporte `docs/trazabilidad-unitarias.md` tendrá una fila por CP-ID con
  requisito, archivo, nombre del test, modalidad y estado `Aprobado`, `Fallido` o
  `Pendiente`, incluyendo motivo para pendientes.
- **Rationale**: Evita contar como aprobados tests no ejecutados y hace visible que RF02,
  RF07 (filtros), RF14, RF15 y RF19 permanecen pendientes.
- **Alternatives considered**: Porcentajes agregados o estados implícitos se descartan
  porque inventan métricas y no permiten auditar cada requisito.
