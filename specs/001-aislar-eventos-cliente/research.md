# Research: Aislar Eventos en Tiempo Real por Cliente

## Decision 1: Reutilizar la validación JWT HTTP mediante una función compartida

- **Decision**: Extraer o exponer una función común que reciba un token, verifique firma y
  expiración con `jsonwebtoken`, consulte `usuarios.token_version` y devuelva el payload
  validado. El middleware HTTP y `io.use()` usarán esa misma función.
- **Rationale**: Evita que el handshake tenga reglas distintas de las rutas HTTP. El login ya
  emite `clienteId` y `tv`; el middleware actual compara `tv` con el valor persistido.
- **Alternatives considered**: Duplicar `jwt.verify` y la consulta en `index.js` fue rechazado
  porque permitiría divergencia de seguridad y mensajes distintos.

## Decision 2: Rooms por cliente y por usuario

- **Decision**: Tras validar el token, el socket se une a una room estable derivada de
  `clienteId` y a otra room estable derivada de `sub`. El `clienteId` nunca se toma de
  `socket.handshake.auth` ni de otro dato enviado por el navegador.
- **Rationale**: La room de cliente permite entregar el mismo evento a todos los usuarios del
  tenant sin iterar sockets; la room de usuario permite invalidar todas las sesiones del usuario
  tras cambio de contraseña, eliminación o desactivación.
- **Alternatives considered**: Filtrar cada socket en cada emisión fue rechazado por ser más
  propenso a errores y por hacer más costosa la entrega.

## Decision 3: Resolver ownership en la frontera MQTT antes de emitir

- **Decision**: Consultar `dispositivos.cliente_id` por el código del tópico después de la
  ingesta/validación existente y antes de cada emisión. Emitir a la room del cliente encontrado;
  si `cliente_id` es `NULL`, no emitir. Mantener intactos el tópico, el parseo, el schema, el
  guardado y los payloads.
- **Rationale**: El dispositivo es la fuente autoritativa de pertenencia; el evento no debe
  confiar en ningún dato del navegador ni añadir campos al contrato existente.
- **Alternatives considered**: Enviar `cliente_id` dentro del evento fue rechazado porque cambia
  el payload y no evita por sí solo una emisión global.

## Decision 4: Invalidación por expiración y por ciclo de vida del usuario

- **Decision**: Registrar por socket el instante `exp` del token y programar un temporizador que
  desconecte el socket al vencer. Limpiar el temporizador y el índice de usuario en `disconnect`.
  Exponer una operación interna `disconnectUserSockets(userId)` y llamarla tras incrementar
  `token_version` por cambio de contraseña, y tras eliminar o desactivar un usuario.
- **Rationale**: `exp` no requiere polling y `tv` permite invalidar inmediatamente sesiones
  antiguas. La room de usuario hace que el cierre abarque todas las pestañas del usuario.
- **Alternatives considered**: Esperar al siguiente evento o consultar periódicamente cada socket
  fue rechazado porque deja una ventana de exposición y agrega carga innecesaria.
- **Scope note**: El esquema actual no tiene `usuarios.activo` ni una operación de desactivación.
  La implementación debe dejar el hook de invalidación listo y conectarlo a cualquier operación
  de desactivación existente o futura, sin inventar una migración de usuarios en esta feature.

## Decision 5: Tratar el error de autenticación como terminal en el dashboard

- **Decision**: En el listener `connect_error`, identificar únicamente el error de autenticación
  producido por el handshake o la desconexión equivalente, desactivar la reconexión automática,
  limpiar la sesión local y redirigir a `login.html`. No tocar los listeners `lectura`/`alerta`.
- **Rationale**: Evita reintentos infinitos con credenciales inválidas y mantiene el contrato de
  eventos y el comportamiento del dashboard fuera de la autenticación.
- **Alternatives considered**: Reintentar con backoff fue rechazado porque la spec exige detener
  los reintentos y enviar al login.
