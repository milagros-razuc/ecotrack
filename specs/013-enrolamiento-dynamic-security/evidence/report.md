# Dynamic Security Spike Report

- Resultado del spike: **Pendiente**.
- Última evidencia A/B reportada: 2026-11-03T00:41:13.919Z, antes de este cierre documental.
- Evidencia A/B detallada: [acl-ab.md](acl-ab.md).
- Alcance actual: la matriz A/B demuestra aislamiento en los seis casos indicados; no prueba por sí sola convivencia estática, arranque limpio TLS/persistencia ni rollback.
- Verificación de código del 2026-11-03: Node.js v23.6.0; 11/11 pruebas unitarias nuevas pasaron; `node --check` y `git diff --check` pasaron.
- La prueba ACL estática existente quedó omitida porque el daemon de Docker no estaba disponible. El archivo local `mosquitto/config/passwd` tampoco estaba presente para validar usernames.
- El quickstart ahora documenta el bootstrap interactivo del admin y la eliminación de ACL de lectura amplias del rol inicial; esos comandos todavía no se ejecutaron contra un broker.

## Resultados acreditados

La evidencia existente registra 6/6 casos A/B: las dos publicaciones propias permitidas, las dos publicaciones cruzadas rechazadas y las dos suscripciones cruzadas rechazadas. Los rechazos observados fueron `Not authorized` del broker. El archivo indica que la ACL estática estaba activa durante la prueba, pero no identifica una sesión exitosa con el usuario backend estático ni con un dispositivo estático. Por eso no se toma como prueba de convivencia.

## Gates pendientes

| Gate | Estado | Evidencia requerida |
|---|---|---|
| Build e inicio del broker con TLS 8883 y plugin | Pendiente | Versión y digest de imagen, logs de carga, hash de configuración y persistencia verificada. |
| Autenticación backend estática y dispositivo estático | Pendiente | Conexión exitosa de cada identidad desde la configuración dynamic-security activa, sin username duplicado. |
| Matriz de aislamiento A/B | Evidencia reportada: 6/6 | Repetir con el script corregido; guardar resultado en `acl-ab.md`. |
| Rollback a configuración estática | Pendiente | Ejecutar el comando y volver a probar la identidad backend y el ACL estáticos. |
| Revisión de secretos y validación documental | Pendiente | Inspección del diff y quickstart, sin versionar secretos ni estado dinámico. |

No se ejecutó en esta actualización el broker TLS, la prueba estática ni el rollback. Por lo tanto, no corresponde clasificar el spike como aprobado o fallido todavía. Mantener el entorno reversible y completar los gates antes del corte del 2026-11-06. Si no se completan, registrar `Pendiente` y aplicar el criterio de rollback definido en el spec.
