# Data Model: Continuidad de lecturas y fecha de captura

## Lectura persistida

Representa una medición aceptada para un dispositivo y un propietario concreto.

| Campo | Tipo/semántica | Reglas |
|---|---|---|
| `id` | Identificador generado | Conserva la unicidad existente entre particiones |
| `dispositivo_codigo` | Código del dispositivo | Debe corresponder a un dispositivo activo |
| `temperatura` | Decimal | Rango físico del esquema MQTT |
| `humedad` | Decimal | Rango físico del esquema MQTT |
| `luminosidad` | Entero | Rango físico del esquema MQTT |
| `timestamp` | `TIMESTAMPTZ` | Fecha de captura: `ts` convertido a UTC o recepción si falta |
| `cliente_id` | Referencia al cliente | Dueño al momento de inserción; no se recalcula al transferir |

La tabla continúa particionada por rango mensual sobre `timestamp`. La partición se elige con
la fecha de captura. La migración asegura mes anterior, actual y siguiente de forma idempotente.

## Mensaje MQTT

Campos obligatorios: `temperatura`, `humedad`, `luminosidad`.

Campo opcional:

- `ts`: entero Unix en segundos UTC. Si está presente, debe estar entre recepción menos 24 horas
  y recepción más un minuto, inclusive.

La ausencia de `ts` indica reloj no sincronizado o firmware antiguo y usa recepción. Un `ts`
presente con tipo inválido se rechaza; no se transforma silenciosamente en ausencia.

## Estado de procesamiento

- **Sin fecha de captura**: `captureAt = receivedAt`; tratamiento reciente y efectos normales.
- **Reciente**: `receivedAt - captureAt <= 5 minutos`; almacena y emite lectura/evalúa umbrales.
- **Diferida**: `receivedAt - captureAt > 5 minutos`; almacena, pero no emite evento ni evalúa
  umbrales.
- **Fuera de rango**: futuro mayor de un minuto o pasado mayor de 24 horas; se rechaza.
- **Anterior al reclamo**: `captureAt < reclamado_en`; se descarta sin almacenar ni efectos.

## Buffer del dispositivo

Entrada volátil en RAM:

```text
{
  ts: Unix seconds (only when NTP is ready),
  temperatura: float,
  humedad: float,
  luminosidad: integer
}
```

Capacidad máxima: 360 entradas. Al llenarse, se elimina la entrada más antigua. Al reconectar,
se publica FIFO con pausa breve y servicio de `mqtt.loop()` entre publicaciones. La entrada se
retira solo después de una publicación exitosa; un reinicio elimina todo el buffer.

## Relaciones y estados

- `dispositivos.reclamado_en` delimita el comienzo del ciclo de propiedad.
- `dispositivos.ultima_conexion` registra recepción, incluso si `timestamp` de una lectura
  aceptada es anterior.
- `lecturas.cliente_id` queda congelado para aislamiento histórico.
- Alertas y eventos solo se derivan de lecturas recientes y de dispositivos con dueño.
