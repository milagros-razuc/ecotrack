# Quickstart: Suite de pruebas unitarias trazables

## Prerrequisitos

- Node.js compatible con la imagen actual del backend (`node:18-alpine`).
- Dependencias instaladas en `backend/`.
- Ningún PostgreSQL, Mosquitto, Docker o hardware requerido.

## Ejecución

Desde `backend/`:

```powershell
npm test
npm run test:coverage
```

La ejecución debe usar exclusivamente el runner `node:test`, cargar los fixtures de
`src/test/helpers/` y completar sin conexiones de red.

## Validaciones

1. Revisar que cada nombre de `describe`/`it` contenga `CP-RFxx` o `CP-REyy`.
2. Confirmar que los escenarios de cliente A y cliente B no intercambien datos.
3. Confirmar que los tests pendientes de RF02, RF07 (filtros históricos), RF14, RF15 y
   RF19 muestran su motivo explícito.
4. Actualizar `docs/trazabilidad-unitarias.md` con el resultado real de la ejecución.
5. Si un test falla por defecto de producción, dejarlo `todo`/`skip` documentado; no
   modificar producción para convertirlo en aprobado.

## Alcance de los comandos

`npm test` valida comportamiento y aislamiento. `npm run test:coverage` genera cobertura
para orientar huecos, pero ningún porcentaje se considera resultado de aceptación por sí
solo y no reemplaza el reporte CP-ID.
