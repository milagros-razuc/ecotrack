# Implementation Plan: Spike de Mosquitto Dynamic Security

**Branch**: `013-enrolamiento-dynamic-security` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

## Summary

Habilitar dynamic-security en el broker TLS existente, incorporar una identidad
administrativa exclusiva para el backend y añadir un script Node.js que use el
cliente `mqtt` ya presente para crear clientes, roles y ACL por dispositivo mediante
`$CONTROL/dynamic-security/v1`. La prueba del spike ejecutará altas reproducibles y
verificará publicación propia, publicación cruzada y suscripción cruzada. La
migración mínima mantiene los usuarios estáticos durante la evaluación, mientras que
la reversión restaura la configuración anterior con un solo comando y conserva los
archivos generados fuera del repositorio.

## Technical Context

**Language/Version**: Node.js existente del backend (>=18.2 según `package.json`),
Mosquitto 2 en Docker, scripts PowerShell/bash compatibles con el entorno.

**Primary Dependencies**: paquete npm `mqtt` ya instalado, Docker Compose, Mosquitto
dynamic-security plugin, PostgreSQL existente solo para verificar el contrato de
dispositivo; no se agrega una dependencia MQTT nueva.

**Storage**: `dynamic-security.json` persistido en un volumen de Mosquitto; secretos
administrativos y credenciales de prueba en `.env`/archivos locales no versionados;
configuración estática existente en `mosquitto/config`.

**Testing**: Tests Node.js `node:test`, pruebas MQTT TLS existentes, Docker Compose y
un script de verificación reproducible que devuelve código distinto de cero ante una
expectativa incumplida.

**Target Platform**: Docker Compose local sobre Linux/Windows con Docker Desktop,
broker Mosquitto TLS 8883 y backend Node.js.

**Project Type**: Servicio web Node.js más infraestructura Docker y scripts operativos.

**Performance Goals**: Cada comando de provisioning debe esperar una respuesta
correlacionada y fallar con timeout explícito; el spike no establece throughput.

**Constraints**: TLS con CA validada y `rejectUnauthorized`; ningún secreto en Git,
logs o salida de verificación; ACL propia limitada a
`ecotrack/<deviceId>/lecturas`; rollback ejecutable con un comando; no modificar
payload ni topic de lecturas.

**Scale/Scope**: Spike para dos dispositivos de prueba y dos identidades de cliente;
no incluye enrolamiento automático, rotación automática ni migración masiva de
dispositivos desplegados.

## Constitution Check

*GATE: Must pass before Phase 0 research and after Phase 1 design.*

- **I. Modular Boundaries**: PASS. El cliente administrativo y el script quedan
  separados del consumidor de lecturas; el contrato MQTT se documenta aparte.
- **II. Secure By Default**: PASS. TLS, CA validada, secretos por entorno local y
  ausencia de credenciales versionadas son requisitos del diseño.
- **III. Validated Data Contracts**: PASS. Se validan `deviceId`, comandos,
  respuestas y permisos esperados antes de declarar éxito.
- **IV. Testable Changes**: PASS. Se mantienen tests estáticos existentes y se
  agregan unitarios para el cliente de control y una verificación Docker TLS.
- **V. Reliable and Observable Operation**: PASS. Persistencia explícita, timeouts,
  logs sanitizados y rollback documentado.
- **VI. Tenant Isolation**: PASS. Las ACL se construyen por deviceId y no se
  conceden comodines de otros dispositivos.
- **VII. Controlled and Auditable Access**: PASS. El usuario admin del backend es
  separado y el provisioning produce evidencia sanitizada.

## Research Summary

Las decisiones y alternativas están desarrolladas en [research.md](research.md).
La documentación oficial de Mosquitto confirma que:

- el plugin recibe comandos JSON en `$CONTROL/dynamic-security/v1`;
- `createClient`, `createRole`, `addClientRole` y `addRoleACL` son operaciones
  distintas;
- `publishClientSend` y `subscribePattern` deben limitarse explícitamente;
- `dynamic-security.json` se actualiza durante la operación y debe persistirse;
- usuarios no dinámicos pueden diferirse a `password_file`/`acl_file`, pero un
  username duplicado queda bajo precedencia dinámica y está fuera de la migración;
- las respuestas deben correlacionarse mediante `correlationData` en
  `$CONTROL/dynamic-security/v1/response`, y un publish sin respuesta no es éxito.

## Project Structure

### Documentation

```text
specs/013-enrolamiento-dynamic-security/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── dynamic-security-control.md
```

### Source Code

```text
backend/
├── scripts/
│   └── provision-mqtt-dynamic.js
└── src/
    ├── services/
    │   └── dynamicSecurity.service.js
    └── test/
        └── dynamic-security.test.js

mosquitto/
├── Dockerfile
└── config/
    ├── mosquitto.conf
    ├── dynamic-security.json.example
    └── static/

scripts/
└── verify-mqtt-dynamic-security.js

docker-compose.yml
```

**Structure Decision**: El control dinámico vive en el backend porque usa su cliente
`mqtt` y su configuración TLS; el script CLI reutiliza el servicio o adaptador sin
mezclarse con la ingesta. Mosquitto conserva configuración y persistencia en su
directorio/volumen. La verificación queda separada para que pueda ejecutarse contra
un entorno limpio y producir evidencia.

## Migration and Rollback

1. Copiar la configuración actual del broker a un snapshot local no versionado.
2. Añadir `plugin`, `plugin_opt_config_file` y `per_listener_settings false`, más
   la persistencia dinámica, sin borrar `passwd`/`acl.conf`.
3. Crear el usuario admin del backend fuera de Git y verificar que puede publicar
   comandos, pero no lecturas.
4. Probar primero los usuarios estáticos existentes. Usar nombres dinámicos que no
   aparezcan en `passwd` y no duplicar ningún username.
5. Si la coexistencia no es segura o el plugin falla, ejecutar
   `scripts/revert-mqtt-dynamic.ps1` (o equivalente documentado) para restaurar el
   snapshot y reiniciar el broker.
6. El script de rollback debe detener el broker, restaurar `mosquitto.conf`,
   `acl.conf` y `passwd`, retirar el montaje/configuración dinámica del compose y
   arrancar la configuración estática anterior. No debe borrar certificados ni
   secretos fuera del repositorio sin una ruta explícita.

## Implementation Phases

### Phase 0: Research

- Confirmar ruta y disponibilidad del plugin dentro de la imagen Mosquitto elegida.
- Confirmar semántica de coexistencia de autenticación/ACL estáticas y dinámica en
  la versión instalada.
- Fijar payloads de control, correlación de respuestas, timeouts y permisos mínimos.

### Phase 1: Design

- Implementar el adaptador de control MQTT con TLS validado, correlación de
  respuestas y sanitización.
- Añadir comandos reproducibles de alta/baja y creación de ACL.
- Añadir configuración Docker, volumen de persistencia y usuario administrativo.
- Añadir verificación propia/cruzada y rollback de un comando.

### Phase 2: Validation

- Ejecutar tests unitarios con doble de MQTT.
- Ejecutar quickstart con dos dispositivos y TLS real.
- Guardar evidencia sanitizada y clasificar `Aprobado`, `Fallido` o `Pendiente`.
- Si falla al corte, revertir y documentar mejora futura 8.2; no declarar éxito sin
  salida real.
