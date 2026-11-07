# Contrato de autorización y auditoría

## T2: platform_admin contra rutas de cliente

Con un usuario `platform_admin` autenticado, enviar JWT crudo en `Authorization` y
probar:

1. `GET /api/dispositivos`: no debe conceder vista global ni permisos de cliente.
2. `GET /api/dispositivos/estado`: no debe conceder vista global ni permisos de
   cliente.
3. `POST /api/dispositivos/:codigo/reset-credenciales`: no debe conceder el reset
   existente de cliente.

Las tres verificaciones deben demostrar que `platform_admin` solo accede mediante
`/api/plataforma/...`. Un `admin` de cliente tampoco puede acceder a endpoints de
plataforma.

## Auditoría visible al cliente

Para un reset originado en plataforma:

- `cliente_id` es el cliente operativo del dispositivo.
- La tabla de auditoría contiene la columna `actor_tipo`, con valor
  `platform_admin` para esta operación.
- El actor presentado al cliente es exactamente `Administración de la plataforma`.
- No se muestran email, username, nombre ni identificadores personales del
  `platform_admin`.
- No se muestran secretos, hashes, tokens, contraseñas ni credenciales MQTT.
- El servicio de auditoría aplica el enmascarado antes de devolver datos tenant;
  ninguna vista o frontend puede deshacerlo.

## Rate limit propio del panel

- Los endpoints `/api/plataforma/...` tienen un limitador independiente de los
  limitadores tenant.
- Valor: máximo 10 solicitudes por 15 minutos por identidad/IP del panel.
- Al superar el límite se responde con el error de rate limit existente, sin
  indicar datos del dispositivo ni del cliente.
