# Contract: Clientes de plataforma

## Listado con administradores

`GET /api/plataforma/clientes`

Permisos: únicamente `platform_admin`.

Respuesta esperada:

```json
[
  {
    "id": 10,
    "nombre": "Ejemplo",
    "cantidad_administradores": 2,
    "administrador_principal": {
      "id": 42,
      "nombre": "Ana",
      "username": "ana",
      "rol": "admin"
    },
    "administradores": [
      {
        "id": 42,
        "nombre": "Ana",
        "username": "ana",
        "rol": "admin"
      }
    ]
  }
]
```

Contrato:

- `administradores` es vacío cuando no hay administrador activo.
- `administrador_principal` es el usuario con menor `id` entre los roles `admin`
  del cliente.
- `cantidad_administradores` indica cuántos usuarios `admin` existen.
- Si hay varios administradores, el listado muestra el principal y el conteo;
  el reset se aplica al principal.
- Incluye todos los clientes no plataforma.
- Resuelve los datos en una carga sin solicitudes por fila.
- Responde 403 a roles distintos de `platform_admin`.

## Usuarios por cliente

`GET /api/plataforma/clientes/:id/usuarios`

Permisos: únicamente `platform_admin`.

Devuelve los usuarios asociados al cliente existente. Se reutiliza el contrato
actual para la vista movida desde `plataforma.html`.

## Reset de administrador

`POST /api/usuarios/:id/reset-password`

Permisos efectivos:

- `platform_admin` puede resetear `admin` o `comun` de cualquier cliente.
- No puede resetear otro `platform_admin` ni sí mismo.
- La interfaz exige selección explícita de un único objetivo si hay varios
  administradores.

La respuesta exitosa contiene el usuario objetivo y la contraseña temporal una
sola vez. La temporal no aparece en HTML persistente, logs, historial ni auditoría.
