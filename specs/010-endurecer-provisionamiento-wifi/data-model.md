# Data Model: Endurecer aprovisionamiento WiFi

## Identidad de fábrica

Representa los valores propios de una unidad antes de su configuración de red.

| Campo | Tipo/forma | Reglas |
|---|---|---|
| `device_id` | texto ASCII | Obligatorio, único globalmente, válido para tópico MQTT y ACL; no contiene secretos. |
| `softap_password` | texto ASCII | Obligatorio, aleatorio, distinto por dispositivo y apto para WPA2; no tiene valor por defecto en el código. |
| `device_secret` | texto ASCII | Obligatorio, aleatorio e independiente; reservado para enrolamiento futuro y no usado en esta feature. |

### Persistencia

Los valores se escriben en NVS usando claves estables dentro del namespace del dispositivo. La identidad de fábrica queda separada de la configuración editable del portal para que guardar un nuevo SSID no regenere ni sobrescriba los valores de fábrica.

Claves lógicas previstas:

- `factoryReady`: marca de escritura completa de identidad.
- `deviceId`: identidad usada por MQTT y ACL.
- `softApPass`: clave opcional del SoftAP; Spec 1A usa un SoftAP abierto.
- `setupPin`: PIN de seis dígitos exigido por el portal antes de mostrar la configuración.
- `serverHost`: hostname o IPv4 del servidor MQTT grabado de fábrica.
- `deviceSecret`: secreto reservado.
- `configured`: marca existente de configuración WiFi/MQTT confirmada.

Una unidad no se considera preparada si falta cualquiera de los tres valores o si `factoryReady` no confirma una escritura completa. La lectura falla explícitamente y evita iniciar un portal con credenciales incompletas.

## Registro de fabricación

Salida local por dispositivo, en CSV y/o etiqueta, vinculada físicamente a la unidad.

Campos mínimos:

- `device_id`
- `softap_password`
- `device_secret`
- `nvs_image`
- `created_at`

El CSV y las imágenes NVS son material sensible: se generan fuera del repositorio y se excluyen mediante `.gitignore`.

## Imagen NVS

Artefacto binario generado por el script para cargar la identidad de una unidad. Debe contener las claves de fábrica y la marca de escritura completa, respetando namespace, tamaño y formato NVS del dispositivo. Su nombre debe permitir vincularlo con `device_id` sin incluir secretos en la ruta si el entorno considera las rutas observables.

## Sesión del portal

Estados:

1. `inactive`: no hay SoftAP disponible.
2. `active`: SoftAP y portal disponibles, con temporizador de inactividad.
3. `connecting`: se recibió una configuración candidata y se está confirmando WiFi/MQTT/TLS.
4. `completed`: configuración confirmada; se ejecuta cierre inmediato.
5. `expired`: se alcanzaron 10 minutos sin configuración válida; se ejecuta cierre.

Transiciones:

- `inactive -> active`: arranque sin configuración válida o BOOT sostenido al menos 3 s.
- `active -> connecting`: formulario válido recibido.
- `connecting -> completed`: WiFi/MQTT/TLS confirmados y configuración persistida.
- `connecting -> active`: fallo de conexión o guardado; se informa error y se conserva el portal.
- `active -> expired`: 10 minutos sin actividad válida.

## Compatibilidad de lectura

La configuración editable mantiene `ssid`, `wifiPassword`, `mqttHost`, `mqttUser` y `mqttPassword`. El `deviceId` se obtiene de la identidad de fábrica y se conserva como campo requerido del contrato MQTT; el buffer de lecturas continúa siendo volátil.
