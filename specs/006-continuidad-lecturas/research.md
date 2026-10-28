# Research: Continuidad de lecturas y fecha de captura

## Decisión 1: Mantener compatibilidad con payloads sin `ts`

**Decision**: `ts` será opcional en `lecturaMqttSchema`. Un payload sin `ts` usará la hora de
recepción como fecha de captura y no se tratará como lectura diferida del buffer.

**Rationale**: El tópico y los dispositivos existentes deben seguir funcionando mientras el
firmware se actualiza. Un valor presente debe ser un entero Unix en segundos; valores de otro
tipo o fuera de rango se rechazan antes de tocar la base.

**Alternatives considered**: Hacer `ts` obligatorio rompería firmware desplegado; aceptar
valores inválidos como ausencia ocultaría errores de reloj y produciría datos históricos
incorrectos.

## Decisión 2: Usar recepción como referencia temporal única

**Decision**: Capturar `receivedAt` una vez al inicio del procesamiento y comparar `ts` contra
esa referencia. Convertir `ts` a `TIMESTAMPTZ` UTC para insertar; usar `receivedAt` únicamente
para `ultima_conexion`, validación de rango y cálculo de atraso.

**Rationale**: Evita que el procesamiento o la latencia cambien los límites de validación y
separa claramente fecha de captura de conectividad.

**Alternatives considered**: Usar `NOW()` en cada query permitiría pequeñas discrepancias;
usar la fecha de recepción para insertar perdería el objetivo de RF23.

## Decisión 3: Validar propietario antes de persistir

**Decision**: Resolver en una operación coordinada el dispositivo activo, `cliente_id` y
`reclamado_en`; descartar sin insertar si no hay propietario o si `captureAt < reclamado_en`.
La actualización de `ultima_conexion` usa `receivedAt` y no se hace para mensajes descartados
por dispositivo sin dueño.

**Rationale**: RNF18 exige que un nuevo propietario no herede lecturas del ciclo anterior.
También preserva el comportamiento vigente de descartar dispositivos sin dueño.

**Alternatives considered**: Insertar y limpiar después dejaría ventanas de exposición y
alertas huérfanas; actualizar conexión antes del descarte marcaría actividad de un dispositivo
que no está operativamente asignado.

## Decisión 4: Clasificar efectos diferidos después de validar y antes de emitir efectos

**Decision**: Una lectura con atraso `> 5 minutos` se inserta, pero omite evaluación de umbrales,
alertas y eventos Socket.IO. Las lecturas con atraso `<= 5 minutos` conservan todos esos efectos.

**Rationale**: La lectura sigue siendo válida para histórico, pero no describe el estado actual.
La clasificación debe ocurrir antes de `emit('lectura')` y de `evaluarUmbral`.

**Alternatives considered**: Omitir solo alertas dejaría eventos de estado actual engañosos;
descartar la lectura perdería el histórico requerido por RNF22.

## Decisión 5: Cubrir la ventana de particiones permitida

**Decision**: La migración idempotente asegura las particiones del mes anterior, actual y
siguiente. Como `ts` válido no puede ser anterior a 24 horas, la partición anterior cubre un
atraso que cruza mes; la actual y siguiente cubren recepción y el margen futuro permitido.

**Rationale**: La partición se determina por fecha de captura, no por recepción. Crear solo el
mes actual falla al cambiar de mes o al insertar una lectura diferida del mes anterior.

**Alternatives considered**: Una partición DEFAULT ocultaría errores de mantenimiento y
complicaría el histórico mensual; DDL por cada mensaje introduciría contención en la ingesta.

## Decisión 6: Buffer circular con confirmación de publicación

**Decision**: El firmware usará 360 entradas en RAM, conservará la lectura más antigua primero,
llamará `mqtt.loop()` durante el vaciado y solo retirará una entrada después de que
`mqtt.publish` confirme éxito. El tamaño máximo de PubSubClient se ajustará para incluir `ts`.

**Rationale**: El buffer es deliberadamente volátil y debe seguir capturando sin bloquear el
watchdog. No eliminar antes de publicar evita perder la entrada si la conexión vuelve a fallar.

**Alternatives considered**: Buffer dinámico o flash no cumplen el límite ni el fuera de alcance;
retirar antes de publicar puede perder lecturas en una reconexión parcial.
