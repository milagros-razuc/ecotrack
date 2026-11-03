# Evidencia de tests de enrolamiento

Fecha de ejecución: 2026-11-02

Comando:

```text
cd backend
node.exe --test --test-timeout=30000 src/test/enrolamiento-dispositivo.test.js
```

Salida real:

```text
TAP version 13
ok 1 - enrolamiento A/B entrega credenciales aisladas y una sola vez
ok 2 - secreto incorrecto y dispositivo no reclamado usan comparación fija y rechazo genérico
ok 3 - fallo de dynamic-security no marca el dispositivo ni deja identidad
ok 4 - fallo de persistencia compensa cliente MQTT y mantiene estado local pendiente
ok 5 - dynamic-security incluye denegación explícita de suscripción global y permiso propio
ok 6 - endpoint exige HTTPS y devuelve el mismo error para body inválido
ok 7 - endpoint acepta el contrato exacto y no toma cliente_id del body
1..7
# tests 7
# pass 7
# fail 0
```

La salida no contiene secretos. La verificación contra una base PostgreSQL real
queda pendiente porque `TEST_DATABASE_URL` no está configurada en este entorno.
