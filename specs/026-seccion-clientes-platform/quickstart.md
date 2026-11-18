# Quickstart: Seccion Clientes de plataforma

## Prerequisitos

- Entorno Docker de EcoTrack levantado.
- Base de datos migrada y usuario `platform_admin` disponible.
- Backend iniciado con el secreto JWT de desarrollo o prueba.

## Validación de navegación

1. Iniciar sesión como `platform_admin`.
2. Verificar «Clientes» en el menú desktop y móvil.
3. Abrir la página.
4. Confirmar todos los clientes y sus administradores.
5. Abrir la URL directa como `admin` o `comun`.
6. Confirmar redirección o rechazo.

## Validación de administradores

1. Abrir un cliente con exactamente un administrador.
2. Confirmar nombre y username.
3. Abrir un cliente sin administrador.
4. Confirmar «Sin administrador» y ausencia de reset.
5. Si existen varios administradores, confirmar que se muestra el administrador
   principal —el usuario con menor id— y el conteo total.

## Validación del reset

1. Seleccionar un administrador elegible y confirmar.
2. Copiar la contraseña temporal del diálogo visible una sola vez.
3. Cerrar el diálogo y confirmar que el valor desaparece.
4. Iniciar sesión con el temporal.
5. Confirmar el cambio obligatorio de contraseña.

## Validación de seguridad

1. Desde un rol de cliente solicitar
   `GET /api/plataforma/clientes` y
   `GET /api/plataforma/clientes/:id/usuarios`.
2. Confirmar 403.
3. Intentar `POST /api/usuarios/:id/reset-password`.
4. Confirmar que no se modifica el objetivo.
5. Revisar auditoría sin contraseña temporal, hash o token.

## Validación de rendimiento

1. Cargar al menos 500 clientes.
2. Abrir «Clientes».
3. Confirmar carga completa sin una solicitud por fila y sin degradación
   perceptible superior a 3 segundos en el entorno objetivo.
