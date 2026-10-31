# Contrato: Historial de alerta

## `GET /api/alertas/:id/historial`

Requiere autenticación. Devuelve `404` cuando la alerta no existe o no
pertenece al `cliente_id` del token.

### Respuesta `200`

```json
{
  "data": [
    {
      "id": 10,
      "alerta_id": 42,
      "cliente_id": 7,
      "usuario_id": 3,
      "usuario_username": "operador",
      "accion": "marcar_atendida",
      "detalle": "Se ajustó la ventilación",
      "timestamp": "2026-10-31T12:00:00.000Z"
    }
  ]
}
```

Los elementos se ordenan ascendentemente por `timestamp` y luego `id`.
`GET /api/alertas/:id/acciones` permanece disponible con la misma respuesta.
Si la alerta no tiene una acción almacenada `generar_alerta`, la respuesta
incluye una entrada derivada desde `alertas.timestamp` y
`alertas.cliente_id`, sin modificar la base de datos.

## `PATCH /api/alertas/:id`

Se mantiene el request `{ "estado": "pendiente|atendida", "comentario": "..." }`
y la respuesta actual de la alerta. La operación crea además la acción
histórica y una entrada administrativa posterior. Una falla de esta última no
cambia el status ni el cuerpo de la respuesta exitosa.
