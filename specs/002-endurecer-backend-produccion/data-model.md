# Data Model: Endurecer backend para producción

## Usuario (`usuarios`)

- **Campos relevantes**: `id`, `username`, `password_hash`, `nombre`, `rol`,
  `cliente_id`, `token_version`.
- **Regla nueva**: `rol` solo admite `admin` o `comun`.
- **Compatibilidad**: los registros existentes cumplen esos valores y no cambian sus
  relaciones ni su representación en endpoints.

## Alerta (`alertas`)

- **Campos relevantes**: `id`, `dispositivo_codigo`, `variable`, `valor`,
  `umbral_min`, `umbral_max`, `timestamp`, `estado`, `comentario`.
- **Regla nueva**: `estado` solo admite `pendiente` o `atendida`.
- **Relación**: `dispositivo_codigo` referencia `dispositivos(codigo)` mediante
  `fk_alertas_dispositivo`.

## Restricciones de integridad

- La FK `fk_alertas_dispositivo` se crea solo si no existe una restricción con ese nombre.
- El CHECK de `usuarios.rol` se crea solo si no existe la restricción definida para ese
  dominio.
- El CHECK de `alertas.estado` se crea solo si no existe la restricción definida para ese
  dominio.
- La migración no modifica valores válidos ni cambia nombres de tablas, columnas,
  endpoints o eventos.

## Configuración operativa

- `NODE_ENV=production` activa la política sin credenciales administrativas por defecto.
- `ADMIN_PASS` se usa únicamente para crear el administrador inicial en una base sin
  usuarios; falta o valor vacío causa error en producción.
- En desarrollo se mantienen los defaults actuales y se emite una advertencia.
- `CORS_ORIGIN` representa una lista normalizada de orígenes autorizados; ausencia equivale
  a `http://localhost:8080`.
