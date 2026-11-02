# Contrato de aislamiento de pruebas

## Alcance

Todo test unitario de `backend/src/test` debe poder ejecutarse sin red, Docker,
PostgreSQL real, broker MQTT o hardware.

## Sustituciones obligatorias

| Dependencia | Sustituto | Evidencia esperada |
|---|---|---|
| `config/db.js` | pool y cliente transaccional falsos | consultas, parámetros, commit/rollback y release observables |
| `mqtt` | cliente falso | connect, subscribe, message, error y desconexión observables |
| reloj | `node:test` mock timers o reloj controlado | instantes reproducibles, incluido el corte de dos minutos |
| hardware | fixture de payload/estado | ninguna llamada física |

Un test que requiera una dependencia real es de integración y no puede marcarse como
cobertura unitaria aprobada.
