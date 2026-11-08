# Research: Panel global de dueños de plataforma

## Decisión: última lectura mediante consulta acotada por dispositivo

La lista global debe obtener la última lectura mediante `LEFT JOIN LATERAL`,
calculado únicamente para los dispositivos de la página ya paginada. La subconsulta
debe incluir `timestamp >= NOW() - ($1 * INTERVAL '1 day')` en su `WHERE`, usar
`ORDER BY timestamp DESC LIMIT 1` y devolver `ultima_lectura = null` si no existe
lectura dentro de la ventana. La ventana por defecto es de 30 días y se configura
con `PLATFORM_LAST_READING_WINDOW_DAYS`.

La consulta debe usar el índice compuesto
`(dispositivo_codigo, timestamp DESC)` y no agregar una lectura global sin límites
que recorra todas las particiones mensuales. El esquema actual ya ofrece esa
definición en el padre particionado como `idx_lecturas_dispositivo_ts`; la
migración 019 debe reconocerla por columnas y orden, reutilizarla y solo crear un
índice alternativo de forma segura si la definición equivalente no existe.

**Rationale**: `lecturas` está particionada por tiempo y el panel necesita una lectura
por dispositivo. Paginar primero y ejecutar el `LATERAL` después evita calcular
lecturas para filas que no se mostrarán. La condición temporal en `WHERE` permite
limitar el trabajo y la ausencia debe devolver explícitamente `null`, no inventar
una fecha.

**Alternatives considered**:
- Reutilizar `ultima_conexion`: rechazado porque representa recepción MQTT, no captura.
- Consultar toda la tabla `lecturas` y agrupar: rechazado por coste y por escanear
  particiones innecesarias.
- Persistir otra columna derivada en `dispositivos`: no se agrega en esta feature
  porque duplicaría el dato y requeriría mantenerlo al insertar lecturas.

La ventana de 30 días, su configuración y la forma de consulta deben quedar
cubiertas por pruebas que demuestren el valor `null` cuando el dispositivo no tiene
lecturas dentro de ella.

## Decisión: JOIN de fabricación por `dispositivos.codigo = dispositivos_fabrica.device_id`

El estado de enrolamiento y `enrolled_at` se obtiene mediante `LEFT JOIN
dispositivos_fabrica f ON f.device_id = d.codigo`. El `LEFT JOIN` conserva
dispositivos históricos o no fabricados en la lista y permite clasificarlos como
`fabricado` cuando no tienen reclamo.

**Rationale**: `dispositivos_fabrica.device_id` es la clave primaria y
`dispositivos.codigo` es la clave referenciada por las lecturas; no se debe unir por
`id` numérico ni inferir el enrolamiento desde `dispositivos`.

## Decisión: cliente especial y seed idempotente

Se mantiene la opción A: agregar una marca explícita `es_plataforma` en `clientes`,
con migración repetible y valor por defecto falso, y crear un cliente especial con
esa marca. El usuario `platform_admin` lo referenciará. El seed debe ser repetible,
detectar por `es_plataforma = true` y no crear duplicados. Los listados,
filtros `cliente_id`, resúmenes y conteos deben excluir ese cliente por una regla
explícita sobre la columna, no por una coincidencia cosmética del nombre. El seed
debe crear o reutilizar también el usuario global de forma idempotente.

El rol se agrega al constraint existente de roles. Ningún middleware de rol debe
tratar `platform_admin` como alias de `admin`; el panel tendrá autorización propia
y las rutas de cliente conservarán sus permisos actuales.

## Decisión: auditoría con cliente afectado y actor de plataforma

Un reset desde el panel registra el `cliente_id` operativo del dispositivo afectado,
el dispositivo, resultado, instante y una columna explícita `actor_tipo` en
auditoría. El servicio de auditoría enmascara el actor cuando `actor_tipo` es
`platform_admin`, y la vista del cliente presenta “Administración de la plataforma”
sin email, username ni nombre del usuario global.

**Rationale**: la FK `auditoria_cliente_id_fkey` exige un cliente válido y el cliente
afectado conserva la trazabilidad tenant. El actor debe seguir siendo distinguible
para auditoría interna sin exponer datos personales al cliente.

La migración de auditoría debe agregar `actor_tipo VARCHAR(30) NOT NULL DEFAULT
'tenant'` de forma repetible. El servicio de auditoría debe aplicar el enmascarado
antes de construir respuestas visibles al cliente, no confiar en que el frontend o
el SQL de cada vista lo haga.

## Decisión: endpoint separado del reset de la spec 016

Se crearán endpoints bajo `/api/plataforma/...`; el reset resolverá primero el
dispositivo y su cliente operativo, y delegará en el servicio de la spec 016 con
argumentos explícitos. El servicio debe permanecer HTTP-agnóstico y no leer
`req.clienteId`.

No se amplía directamente `/api/dispositivos/:codigo/reset-credenciales` porque
esa ruta está montada bajo `extraerCliente` y su contrato está diseñado para
administradores tenant. Separar la superficie evita que una autorización global
saltee el aislamiento de las rutas existentes.

## Decisión: pruebas y operación

Los tests de integración reutilizan las guardas existentes de `TEST_DATABASE_URL`.
La línea base registrada antes de la feature es 76 tests pasados de 77, con un fallo
preexistente en el subtest 13 de continuidad por falta de partición mensual; T011
pasó.
T2 debe ejercitar explícitamente, con JWT `Authorization` crudo sin `Bearer`, las
rutas `/api/dispositivos`, `/api/dispositivos/estado` y
`/api/dispositivos/:codigo/reset-credenciales` usando un `platform_admin`, y
verificar que no recibe permisos de administrador tenant.

El reset tiene un rate limit propio de 10 solicitudes por 15 minutos por
identidad/IP del panel, configurable con
`PLATFORM_RESET_RATE_LIMIT_MAX` y `PLATFORM_RESET_RATE_LIMIT_WINDOW_MS`. Las
lecturas del panel tienen un límite independiente más alto, configurable con
`PLATFORM_READ_RATE_LIMIT_MAX` y `PLATFORM_READ_RATE_LIMIT_WINDOW_MS`; ambos
limitadores mantienen contadores propios y no comparten el contador tenant.

La validación final incluye una prueba manual con una placa real (una placa ESP32
enrolada): reset desde el
panel, re-enrolamiento, publicación de lectura y confirmación de estado, firmware,
última lectura, última conexión y auditoría sanitizada.
