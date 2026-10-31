# Contrato: imagen NVS de fábrica

## Propósito

Definir la entrada/salida del script de fabricación y el contenido mínimo que el firmware espera encontrar en NVS. Este contrato no expone una API de backend.

## Entrada del script

- Cantidad de dispositivos o una lista de identificadores físicos/etiquetas.
- Ruta de salida local fuera del repositorio.
- Tamaño de la partición NVS y namespace compatible con el firmware.

El script no acepta secretos como argumentos de línea de comandos; los genera internamente con `secrets`.

## Salidas

Por cada unidad, produce:

1. Una imagen NVS binaria cargable por `nvs_partition_gen.py`.
2. Una fila CSV y una etiqueta equivalente con `device_id`, PIN, `serverHost`, secreto reservado y nombre de imagen.

Falla con código distinto de cero ante parámetros inválidos, colisiones, error al generar la imagen o salida dentro de un directorio versionado.

## Claves NVS

| Namespace | Key | Tipo | Significado |
|---|---|---|---|
| `ecotrack` | `factoryReady` | booleano | Identidad completa y verificada. |
| `ecotrack` | `deviceId` | cadena | Identidad MQTT/ACL. |
| `ecotrack` | `softApPass` | cadena opcional | Clave opcional; Spec 1A inicia un SoftAP abierto. |
| `ecotrack` | `setupPin` | cadena | PIN de seis dígitos para desbloquear el portal. |
| `ecotrack` | `serverHost` | cadena | Hostname o IPv4 del servidor MQTT. |
| `ecotrack` | `deviceSecret` | cadena | Secreto reservado para enrolamiento futuro. |

La imagen no incluye SSID, contraseña WiFi ni contraseña MQTT: esos valores se capturan posteriormente por el portal.
