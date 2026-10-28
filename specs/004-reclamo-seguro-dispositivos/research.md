# Research: Reclamo seguro y aprovisionamiento de dispositivos

## Decisión 1: Hash determinista para validar tokens de reclamo

- **Decision**: Generar el secreto con `crypto.randomBytes`, devolverlo solo durante el aprovisionamiento y persistir un hash SHA-256 codificado en hexadecimal en una columna dedicada. Comparar el hash calculado del token presentado con la columna almacenada dentro de la condición SQL.
- **Rationale**: El token es aleatorio y de alta entropía, por lo que un hash determinista permite una búsqueda y consumo atómico sin guardar el secreto. No se necesita un hash adaptativo de contraseña porque el token no es elegido por el usuario y debe validarse en una única operación SQL.
- **Alternatives considered**: Guardar el token en claro se rechaza por RNF17. bcrypt/argon2 agrega costo y complica la operación atómica sin aportar una defensa relevante frente a un secreto aleatorio generado por el sistema. Cifrado reversible se rechaza porque permitiría recuperar el secreto almacenado.

## Decisión 2: Reclamo atómico condicionado

- **Decision**: Usar `INSERT ... ON CONFLICT (codigo) DO UPDATE` con `WHERE dispositivos.cliente_id IS NULL AND dispositivos.token_reclamo_hash = $tokenHash`, actualizando `cliente_id`, `activo`, `nombre`, `ubicacion`, `reclamado_en` y consumiendo el hash en la misma operación; `RETURNING` distingue éxito de rechazo.
- **Rationale**: PostgreSQL serializa el conflicto por código y la condición se evalúa al actualizar, de modo que dos reclamos concurrentes no pueden reclamar el mismo ciclo. Un `rowCount` cero no cambia el dueño.
- **Alternatives considered**: Leer y luego actualizar requiere bloqueo explícito y deja más superficie para carreras. Un endpoint separado de “validar token” filtraría información sensible y no garantiza consumo único.

## Decisión 3: Ciclos de token, rotación y baja

- **Decision**: `scripts/provision-device.js <codigo>` crea únicamente códigos nuevos, imprime el token una sola vez y rechaza códigos existentes sin cambios. `--rotate <codigo>` solo funciona para un dispositivo sin dueño, reemplaza el hash anterior por uno nuevo e invalida el anterior. La baja borra el hash vigente y deja `token_reclamo_hash = NULL`, `cliente_id` nulo, `activo` falso, limpia nombre/ubicación y elimina umbrales en una transacción.
- **Rationale**: La baja debe dejar el dispositivo inutilizable para reclamos hasta que un operador verifique y habilite el siguiente ciclo. Nunca hay más de un token válido y los dispositivos existentes con dueño no reciben secretos automáticamente. Las lecturas y alertas conservan su `cliente_id`, por lo que la limpieza operativa no afecta el histórico.
- **Alternatives considered**: Generar automáticamente un token durante la baja contradice el requisito de habilitación exclusiva por operador. Permitir `--rotate` con dueño podría habilitar un segundo token sin transferir control. Reutilizar el token anterior permite reclamos con credenciales antiguas.

## Decisión 4: Migraciones y backfills idempotentes

- **Decision**: Detectar si `dispositivos.cliente_id` existía antes de agregarla y ejecutar el backfill de dispositivos/usuarios solo dentro de la primera creación de la columna. Detectar por separado las columnas de hash y `reclamado_en`; no generar ni backfillear tokens para dispositivos existentes, incluidos los que ya tienen dueño. Convertir `alertas.valor`, `umbral_min` y `umbral_max` a `DECIMAL(6,2)` con `ALTER COLUMN ... TYPE ... USING`.
- **Rationale**: La columna `cliente_id` ya distingue bases previas a multi-cliente; repetir el update en cada arranque reasigna dispositivos liberados. Los dispositivos existentes sin token deben aprovisionarse de forma explícita, no recibir un secreto desconocido. La conversión de alertas alinea precisión con umbrales y evita truncamientos futuros.
- **Alternatives considered**: `UPDATE ... WHERE cliente_id IS NULL` en cada arranque es incorrecto para dispositivos liberados. Crear tokens automáticamente sin entregarlos al operador produciría secretos no controlados y modificaría dispositivos existentes. Reemplazar la tabla de alertas perdería histórico.

## Decisión 5: Seeds condicionados al dueño

- **Decision**: El seed de `ESP32-001` solo se inserta/reclama cuando se crea el dispositivo seed, y los umbrales se insertan únicamente si el dispositivo existe y tiene `cliente_id` no nulo; nunca se insertan umbrales para un dispositivo liberado o sin dueño.
- **Rationale**: Los seeds deben ser repetibles sin restaurar configuración de un dispositivo liberado ni interferir con ciclos de reclamo.
- **Alternatives considered**: Mantener el insert de umbrales incondicional reintroduce configuración en un estado que debe estar limpio. Eliminar todos los seeds rompería el entorno de desarrollo existente.

## Decisión 6: Auditoría y pruebas

- **Decision**: Registrar acciones separadas para aprovisionamiento, reclamo y baja, con código como identificador y detalles sin token. Cubrir servicio/ruta y PostgreSQL real: éxito, código sin token, token inválido, token reutilizado, dos reclamos concurrentes, baja/reinicio y aislamiento histórico.
- **Rationale**: La auditoría debe probar quién realizó el cambio sin revelar el secreto. La concurrencia y el reinicio solo son verificables de forma confiable contra PostgreSQL y el arranque real de la migración.
- **Alternatives considered**: Tests solo con mocks no validan `ON CONFLICT`, restricciones ni idempotencia. Registrar el token en `detalle` viola el requisito de secreto.

## Decisión 7: Compatibilidad mínima del frontend y rechazo uniforme

- **Decision**: Mantener `POST /api/dispositivos` como punto de reclamo, agregando el campo `token` al formulario existente. `frontend/index.html` incorpora solo el input y `frontend/shared/app.js` conserva la lógica común; el manejo específico muestra un mensaje genérico si el backend responde `409`.
- **Rationale**: Evita un rediseño y mantiene el flujo actual de alta con el nuevo requisito de seguridad. Todos los rechazos de reclamo (código inexistente, dueño existente, token inválido o token usado) usan `409` y el mismo formato de error para no revelar el motivo.
- **Alternatives considered**: Crear una nueva pantalla o endpoint de reclamo ampliaría el alcance innecesariamente. Diferenciar estados por causa permitiría inferir la existencia o propiedad del dispositivo.
