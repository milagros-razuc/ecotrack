# Research: Endurecer backend para producción

## Decision: Reutilizar la migración existente y hacer sus cambios idempotentes

**Rationale**: `backend/src/config/migrate.js` ya se ejecuta al arrancar y ya contiene un
bloque `DO $$` que consulta `pg_constraint` para `fk_alertas_dispositivo`. La misma
estrategia permite agregar los CHECK solo cuando no exista una restricción equivalente,
evitando errores en cada arranque.

**Alternatives considered**: migraciones versionadas separadas o `ALTER TABLE` directo.
Se descartan porque contradicen el alcance de reutilizar la estructura y no serían
seguras al ejecutarse en cada arranque.

## Decision: Validar `ADMIN_PASS` solo cuando deba crearse el administrador inicial

**Rationale**: En producción no deben existir credenciales por defecto. La base existente
puede arrancar sin esa variable cuando ya tiene usuarios, pero una base vacía debe fallar
antes de crear el administrador. Fuera de producción se mantienen los valores actuales y
se emite una advertencia.

**Alternatives considered**: exigir `ADMIN_PASS` en todos los arranques de producción o
permitir siempre `admin123`. La primera impediría reinicios de bases ya inicializadas y
la segunda viola la regla de producción.

## Decision: Una función normalizadora para `CORS_ORIGIN`

**Rationale**: Express y Socket.io deben compartir exactamente la misma política. La
función debe usar `http://localhost:8080` si la variable está ausente, separar por comas,
quitar espacios y eliminar duplicados sin aceptar comodines.

**Alternatives considered**: parsear la variable por separado en `app.js` e `index.js`.
Se descarta porque permitiría divergencias entre REST y Socket.io.

## Decision: Helmet antes de las rutas y sin cambios de contrato

**Rationale**: Helmet añade cabeceras HTTP de seguridad en el límite del backend. Colocarlo
antes de las rutas cubre respuestas públicas y protegidas sin modificar sus cuerpos.

**Alternatives considered**: aplicar Helmet solo a rutas protegidas o configurar manualmente
cabeceras individuales. Se descarta por cobertura incompleta y duplicación.

## Decision: Tests de integración con `node:test` y `TEST_DATABASE_URL`

**Rationale**: El repositorio ya usa `node:test`, Socket.io Client y un fixture que exige
una base cuyo nombre termine en `_test`. Los nuevos casos seguirán ese patrón y aislarán
sus datos mediante nombres únicos y limpieza.

**Alternatives considered**: mocks de PostgreSQL. Se descartan para CHECK, FK e
idempotencia porque no prueban el comportamiento real de la base.
