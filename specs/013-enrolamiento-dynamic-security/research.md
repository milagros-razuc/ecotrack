# Research: Spike de Mosquitto Dynamic Security

## Decision 1: Usar el API MQTT de control del plugin

**Decision**: Publicar comandos JSON en `$CONTROL/dynamic-security/v1` desde un
cliente administrativo MQTT del backend y suscribirse antes al topic
`$CONTROL/dynamic-security/v1/response`. Cada comando llevará `correlationData`;
una respuesta ausente, duplicada, malformada o con `error` será fallo.

**Rationale**: Es el mecanismo operativo documentado por Mosquitto para modificar
clientes, roles y ACL sin editar el estado interno mientras el broker está activo.
El backend ya tiene el paquete `mqtt` y validación TLS con CA. El `publish` MQTT
por sí solo no confirma que el broker haya ejecutado el comando.

**Alternatives considered**: Invocar `mosquitto_ctrl dynsec` desde el backend fue
descartado para el camino principal porque introduce dependencia de binarios,
credenciales en procesos y una frontera operativa adicional. Puede quedar como
herramienta de diagnóstico.

**Source**: Documentación oficial de Mosquitto Dynamic Security:
https://mosquitto.org/documentation/dynamic-security/ y
https://github.com/eclipse-mosquitto/mosquitto/blob/master/plugins/dynamic-security/README.md

## Decision 2: Separar cliente admin, clientes de dispositivos y roles

**Decision**: Crear un usuario administrativo exclusivo para control y un rol por
dispositivo, con permisos explícitos para `publishClientSend` sobre el topic propio,
`subscribePattern` denegado para topics ajenos y solo los permisos de recepción que
requiera el caso probado.

**Rationale**: El plugin evalúa publicación enviada, recepción y suscripción por
eventos separados; permitir solo publicación no garantiza por sí solo el rechazo de
una suscripción cruzada. Los roles evitan asignar permisos de un dispositivo al
usuario admin.

**Alternatives considered**: Un rol global con patrones por username fue descartado
para el spike porque dificulta demostrar aislamiento y aumenta el riesgo de
comodines demasiado amplios.

## Decision 3: Migración mínima conservadora

**Decision**: Mantener `passwd`/`acl.conf` durante la primera prueba. Mosquitto
permite que el plugin devuelva `DEFER` para usuarios no dinámicos, por lo que las
identidades estáticas pueden seguir operando. El usuario admin dinámico y los
clientes dinámicos deben usar nombres que no existan en los archivos estáticos;
nunca se duplica un username. La reversión restaura el snapshot anterior con un
comando.

**Rationale**: El plugin se ejecuta antes de los mecanismos incorporados y difiere
usuarios no dinámicos, pero un username presente en ambos sistemas tiene precedencia
dinámica efectiva y puede cambiar el comportamiento de autenticación. Mantener los
archivos evita interrumpir el backend y dispositivos existentes, mientras que los
nombres separados evitan ambigüedad.

**Alternatives considered**: Migración inmediata de todos los usuarios fue descartada
por riesgo operativo; eliminar `acl_file` desde el primer arranque fue descartado
porque impide comparar el baseline.

## Decision 4: Persistencia y secretos

**Decision**: Montar un volumen para `dynamic-security.json`; inyectar la credencial
admin y las credenciales de prueba desde `.env`/archivos fuera de Git. La evidencia
solo muestra usernames no sensibles, topics, códigos de resultado y logs
sanitizados.

**Rationale**: El plugin persiste cambios en el archivo de configuración dinámica y
la constitución exige que secretos no entren al repositorio.

## Decision 5: Configuración y usuario inicial

**Decision**: Configurar `plugin`, `plugin_opt_config_file` y
`per_listener_settings false`. Crear el admin inicial mediante el mecanismo de
inicialización documentado, usando un secreto inyectado desde un archivo local o
Docker secret, nunca desde un valor versionado. El rol admin solo tendrá permisos
del namespace de control.

**Rationale**: La ruta del plugin depende de la distribución; la configuración debe
fallar explícitamente si la biblioteca no existe. Separar el rol admin de los
permisos de aplicación reduce el impacto de esa credencial.

## Resolved verification

- La imagen `eclipse-mosquitto:2` aún debe inspeccionarse durante el build para
  confirmar la ruta real de `mosquitto_dynamic_security.so`; si no está presente,
  el Dockerfile debe instalar el paquete/plugin sin ocultar el error.
- La precedencia y el fallback documentados deben confirmarse en la imagen real con
  una prueba de usuarios estáticos y dinámicos, sin reutilizar usernames.
- El resultado del spike sigue sin estar ejecutado: se debe registrar
  `Aprobado`, `Fallido` o `Pendiente` según la salida obtenida.
