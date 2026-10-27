# CORS y compatibilidad externa

## CORS

La política es única para Express y Socket.io:

- Entrada: `CORS_ORIGIN`, lista separada por comas.
- Normalización: quitar espacios laterales y eliminar duplicados.
- Default: `http://localhost:8080`.
- Un origen no incluido no recibe autorización CORS.
- La ausencia de `Origin` no debe bloquear clientes no basados en navegador.

## Compatibilidad preservada

- Endpoints REST existentes: sin cambios de rutas, métodos, cuerpos o códigos esperados.
- Eventos Socket.io `lectura` y `alerta`: sin cambios de nombres ni payloads.
- Contrato MQTT `ecotrack/<deviceId>/lecturas`: sin cambios.
- Contrato de `change-password`: sin cambios.

La única modificación transversal observable es la adición de cabeceras de seguridad HTTP
y la restricción de orígenes autorizados.
