# Quickstart de validación

## Prerrequisitos

- Node.js y dependencias del backend instaladas.
- PostgreSQL de pruebas disponible.
- `TEST_DATABASE_URL` configurada con una URL PostgreSQL separada cuyo nombre termine en
  `_test`.

## Ejecución de pruebas

Desde `backend`:

```powershell
$env:TEST_DATABASE_URL = "postgresql://usuario:password@localhost:5432/ecotrack_test"
npm test
```

La suite debe comprobar:

1. producción sin `ADMIN_PASS` falla al crear el administrador inicial;
2. producción no crea el usuario de prueba;
3. desarrollo conserva defaults y muestra advertencia;
4. dos ejecuciones de `migrate.js` no fallan;
5. PostgreSQL rechaza roles y estados inválidos;
6. la FK de alertas permanece idempotente;
7. un origen permitido recibe CORS REST y Socket.io;
8. un origen no permitido no recibe cabeceras CORS;
9. las respuestas mantienen endpoints y payloads existentes y reciben cabeceras Helmet.

## Verificación manual opcional

Configurar `CORS_ORIGIN` con dos orígenes separados por coma, iniciar el backend y
consultar `/health` con cada cabecera `Origin`. Repetir el intento con un tercer origen
no configurado. Para Socket.io, usar el cliente de pruebas con el mismo origen y token
válido.

No ejecutar pruebas contra la base de desarrollo: el fixture debe rechazar una URL que no
termine en `_test` o que coincida con la base de desarrollo.
