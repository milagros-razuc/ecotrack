# Contrato MQTT de lecturas

## Topic

```text
ecotrack/<deviceId>/lecturas
```

El tópico y la autenticación TLS/ACL son los definidos por la spec 005 y no cambian.

## Payload compatible

```json
{
  "temperatura": 23.4,
  "humedad": 47.0,
  "luminosidad": 65,
  "ts": 1767225600
}
```

`ts` es opcional para conservar compatibilidad:

```json
{
  "temperatura": 23.4,
  "humedad": 47.0,
  "luminosidad": 65
}
```

`ts` debe ser un entero Unix en segundos UTC. El backend lo acepta solo dentro del rango
inclusivo de 24 horas anteriores a un minuto posterior a la recepción. Los valores ausentes,
no enteros, no numéricos o fuera de rango se distinguen: solo la ausencia activa el fallback
de recepción.

## Firmware

Con NTP listo, el firmware añade `ts = time(nullptr)`. Sin NTP listo, publica sin `ts` y no
almacena esa lectura en el buffer diferido. El buffer no cambia el topic ni el formato de los
campos existentes.
