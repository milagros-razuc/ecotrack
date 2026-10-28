# Contrato de prueba de ACL MQTT

## Precondiciones

- Broker levantado con TLS en `8883`, CA válida y dos usuarios de dispositivo de prueba.
- Backend conectado con su usuario MQTT y suscrito a `ecotrack/+/lecturas`.
- Los dispositivos de prueba A y B tienen tópicos distintos y credenciales propias.

## Caso válido

1. A publica un payload válido en `ecotrack/A/lecturas`.
2. La observación del backend confirma una única ingesta de A dentro de la ventana de espera.

## Caso cruzado

1. A publica el mismo tipo de payload en `ecotrack/B/lecturas`.
2. La prueba espera la ventana definida sin exigir un error del publicador.
3. La observación confirma que el backend no recibe ni persiste el mensaje cruzado.

## Criterio de aislamiento

La prueba falla si el mensaje cruzado llega al callback de ingesta o crea una lectura de B.
Una ausencia de error en `publish()` no constituye éxito; el éxito es la ausencia observable
en el backend, compatible con MQTT 3.1.1.
