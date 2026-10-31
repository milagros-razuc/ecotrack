# Data Model: Suite de pruebas unitarias trazables

## Caso de prueba

- **Identidad**: `CP-RFxx` o `CP-REyy`.
- **Atributos**: requisito fuente, archivo, nombre `describe`/`it`, modalidad
  (unitaria, ruta o pendiente), estado y motivo.
- **Reglas**: el ID es obligatorio en el nombre del test; un caso no ejecutado solo puede
  figurar como `Pendiente`; `Fallido` conserva el defecto observado.

## Fixture de cliente

- **Atributos**: `clienteId`, nombre, dispositivos, lecturas, alertas, umbrales y usuarios.
- **Relaciones**: cada dispositivo pertenece a cero o un cliente; lecturas y alertas
  conservan el cliente vigente al generarse; usuarios pertenecen a un cliente.
- **Reglas**: los escenarios de aislamiento usan simultáneamente cliente A y cliente B y
  nunca derivan `clienteId` de la entrada del usuario.

## Doble de dependencia

- **Atributos**: pool simulado, cliente transaccional, cliente MQTT y reloj controlado.
- **Comportamiento**: registra consultas/parámetros, transiciones de transacción, mensajes,
  emisiones y tiempos para que cada test pueda verificar efectos y ausencia de efectos.
- **Reglas**: no abre red, no usa Docker, no conecta PostgreSQL/MQTT real y no requiere
  hardware.

## Estado de alerta

- **Valores**: `pendiente` y `atendida`.
- **Transiciones**: pendiente → atendida con comentario; atendida → pendiente con
  comentario; misma transición sin cambio no crea una auditoría nueva.
- **Aislamiento**: la alerta solo se obtiene, modifica o lista cuando su `cliente_id`
  coincide con el cliente autenticado.

## Estado de dispositivo

- **Valores**: `online`, `offline`, `nunca_conectado`.
- **Regla temporal**: online si la última conexión es menor a dos minutos; exactamente dos
  minutos y cualquier instante posterior son offline; sin conexión es nunca conectado.
