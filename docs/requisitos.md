# EcoTrack IoT — Requisitos

Resumen operativo del documento *Proyecto Final de Sistemas — EcoTrack (versión 1)*,
de Razuc Milagros y Cabrera Ramiro (UdeMM). Sirve como fuente de verdad para Spec Kit.

**Cómo usarlo**

- Cada especificación (`/speckit.specify`) debe citar los IDs que implementa o modifica
  (RF, RNF, RI, RE, RD, CU) y no contradecirlos sin enmendar este archivo.
- Si un cambio altera un requisito, se actualiza primero este archivo y después la spec.
- Este archivo describe lo que el sistema **debe** hacer. Qué está implementado hoy se
  verifica en el código, no acá.
- Los IDs son los del documento original. Las secciones 3.5, 4.3.2 y 4.6 de la tesis
  tienen el detalle completo.

---

## 1. Contexto

Sistema de monitoreo ambiental IoT (temperatura, humedad, luminosidad) para PyMEs,
laboratorios y viveros. Modelo SaaS multi-cliente. Tres capas:

1. **Edge:** ESP32 con DHT11 (temperatura y humedad) y LDR (luminosidad), por WiFi.
2. **Backend:** Node.js + Express, PostgreSQL, broker Mosquitto (MQTT), Socket.io.
3. **Presentación:** dashboard web (HTML, Tailwind CSS, Chart.js).

Roles: **admin** (gestiona dispositivos, umbrales, usuarios y claves de API de su cliente)
y **comun** (consulta, histórico y gestión del estado de alertas). Ambos ven solo los
datos de su cliente.

Restricciones: sin autenticación federada en la versión inicial; el monitoreo se limita a
tres variables, pero la arquitectura debe permitir sumar sensores; el aislamiento entre
clientes es absoluto.

---

## 2. Requisitos funcionales

| ID | Requisito |
|---|---|
| RF01 | Capturar temperatura, humedad y luminosidad de forma continua con sensores conectados al ESP32. |
| RF02 | Permitir configurar el intervalo de captura. |
| RF03 | El dispositivo transmite los datos automáticamente al backend por WiFi. |
| RF04 | El backend valida formato y coherencia de lo recibido y rechaza o registra lo que no cumple. |
| RF05 | Almacenar los datos en base estructurada, asociados al cliente y al dispositivo. |
| RF06 | Mostrar en tiempo real los valores actuales en un dashboard accesible desde cualquier navegador. |
| RF07 | Consultar el historial por rango de fechas y por variable. |
| RF08 | Configurar umbrales máximo y mínimo por variable. |
| RF09 | Generar alertas automáticas al superar o bajar de los umbrales. |
| RF10 | Notificar alertas activas con un pop-up dentro del dashboard. |
| RF11 | Registrar un log de alertas (variable, valor, umbral, fecha y hora) y permitir gestionar su estado. |
| RF12 | Gestionar dispositivos (alta, baja y modificación) asociados a un cliente. |
| RF13 | Panel de control con estado de dispositivos, alertas activas y resumen, del cliente del usuario. |
| RF14 | Registrar logs de actividad para auditoría y trazabilidad. |
| RF15 | Configuración inicial del WiFi de cada ESP32 mediante una conexión temporal desde una app o página móvil, sin reprogramar el firmware por unidad. (La tesis lo define con Bluetooth.) |
| RF16 | El admin crea, modifica y elimina cuentas dentro de su cliente, asignando rol. |
| RF17 | Las funciones administrativas se restringen a usuarios admin. |
| RF18 | Cada dispositivo se asocia a un cliente; cada usuario ve y opera solo sobre lo de su cliente. |
| RF19 | API pública documentada para sistemas externos autorizados (lecturas, alertas, estado de dispositivos). |
| RF20 | Cada usuario ve y edita su perfil, incluido el cambio de contraseña. |

---

## 3. Interfaces

### Usuario

| ID | Requisito |
|---|---|
| RI01 | Dashboard web con login, panel, histórico, auditoría, configuración, usuarios y perfil. |
| RI02 | Valores actuales en tarjetas con indicadores y barras de progreso, actualizados sin recargar. |
| RI03 | Histórico con series temporales, período de agregación y filtro por dispositivo. |
| RI04 | Configuración de umbrales por variable y dispositivo, y activación de notificaciones. |
| RI05 | Alertas con indicador por estado (pendiente o atendida) y notificación emergente al generarse. |
| RI06 | Login con usuario y contraseña; la interfaz se adapta al rol. |
| RI07 | Auditoría: listar, filtrar, paginar alertas y gestionar su estado. |
| RI08 | Gestión de usuarios solo para admin, dentro de su cliente. |
| RI09 | Perfil: cualquier usuario edita sus datos y contraseña. |

### Hardware

| ID | Requisito |
|---|---|
| RI10 | Sensor de temperatura y humedad por protocolo digital de un solo cable. |
| RI11 | Luminosidad con fotorresistencia (LDR) en entrada analógica. |
| RI12 | Alimentación por USB (5 V). |
| RI13 | Soporte BLE para la configuración inicial de WiFi, independiente de la radio WiFi. |

### Software

| ID | Requisito |
|---|---|
| RI14 | API REST en capas para recepción de datos, dashboard y sistemas externos autorizados. |
| RI15 | Base de datos relacional para clientes, dispositivos, lecturas, umbrales, alertas y usuarios. |
| RI16 | Firmware con librerías específicas para sensores y comunicación inalámbrica (WiFi, Bluetooth) y mensajería. |
| RI17 | Autenticación por tokens, contraseñas con hash seguro y validación por esquemas; la autorización contempla rol y cliente. |
| RI18 | Dashboard con tecnologías estándar del lado cliente, consumiendo la API REST. |
| RI19 | El backend emite eventos en tiempo real hacia los clientes conectados, sin consulta periódica. |
| RI20 | La API pública exige un mecanismo de autenticación propio (claves de API), independiente del dashboard, y documentación técnica. |

### Comunicación

| ID | Requisito |
|---|---|
| RI21 | Dispositivo a backend por publicación/suscripción; cada dispositivo publica en un tópico asociado a su código. El cliente se resuelve en el backend. |
| RI22 | Datos en JSON. |
| RI23 | Backend a dashboard por HTTP, complementado con comunicación bidireccional para tiempo real. |
| RI24 | La conexión backend-bróker se autentica con credenciales configuradas por dispositivo. |

---

## 4. Eficiencia y diseño

| ID | Requisito |
|---|---|
| RE01 | Procesar, almacenar, evaluar umbrales y emitir el evento de cada lectura en un tiempo no perceptible. |
| RE02 | El dashboard refleja lo más reciente con actualización periódica más eventos en tiempo real, sin sobrecarga. |
| RE03 | Soportar múltiples dispositivos de múltiples clientes simultáneamente. |
| RE04 | Consultas de historial agregado en tiempo razonable, apoyadas en agregación de la base. |
| RE05 | El consumo del ESP32 se mantiene dentro de los límites del hardware. |
| RE06 | Tiempos consistentes sin importar la cantidad de clientes (índices, particionado). |
| RD01 | WiFi según IEEE 802.11. |
| RD02 | Dispositivo-backend según MQTT (OASIS). |
| RD03 | Backend REST con JSON. |
| RD04 | Autenticación con estándar abierto de tokens y hash adaptativo de contraseñas. |
| RD05 | Referencia ISO/IEC 25010. |
| RD06 | Configuración inicial de conectividad basada en BLE. |
| RD07 | Firmware liviano (RAM y flash limitadas). |
| RD08 | Precisión de sensores acotada por el modelo (DHT11: ±2 °C, ±5 %). |
| RD09 | Alcance de WiFi y Bluetooth limitado por cobertura y distancia. |
| RD10 | Sin redundancia de hardware en la versión inicial. |

---

## 5. Requisitos no funcionales

| ID | Requisito |
|---|---|
| RNF01 | Acceso con credenciales verificadas por hash seguro; sesiones por tokens con expiración definida. |
| RNF02 | Comunicación dispositivo-bróker y bróker-backend autenticada con credenciales por dispositivo. |
| RNF03 | Validar con esquemas los datos de entrada de todas las peticiones. |
| RNF04 | Historial completo de eventos de alerta, con consulta y gestión desde auditoría. |
| RNF05 | Aislamiento lógico entre clientes: ninguna consulta expone información de otro cliente. |
| RNF06 | Credenciales sensibles fuera del control de versiones. |
| RNF07 | Backend organizado en capas diferenciadas. |
| RNF08 | Documentación técnica actualizada. |
| RNF09 | Convenciones de estilo y buenas prácticas. |
| RNF10 | Dashboard compatible con navegadores modernos. |
| RNF11 | Dashboard adaptable a distintos tamaños de pantalla. |
| RNF12 | Backend desplegable en distintos entornos de hosting. |
| RNF13 | Fiabilidad ante caída del backend o del bróker. |
| RNF14 | Usabilidad sin capacitación especializada. |
| RNF15 | Escalabilidad: nuevos clientes y dispositivos sin rediseñar la estructura. |

---

## 6. Reglas de negocio

**Umbrales**

- Una lectura genera alerta si y solo si su valor es estrictamente menor que `umbral_min`
  o estrictamente mayor que `umbral_max` de esa variable y dispositivo.
- Sin umbral configurado no se evalúa alerta (no hay umbral por defecto).
- Con `notificaciones_activas = false` no se generan alertas para esa variable.
- `umbral_min` debe ser menor que `umbral_max`; el backend rechaza con 400 lo contrario.

**Histórico**

- "día" agrupa por hora; "semana" y "mes" agrupan por día calendario.
- Promedio, mínimo y máximo se calculan solo sobre lecturas recibidas, sin interpolar.

**Estado de dispositivo**

- *online* si su última conexión fue hace menos de 2 minutos, *offline* si no, y
  *nunca conectado* si jamás reportó.

**Aislamiento multi-cliente**

- Ninguna consulta, listado o suscripción en tiempo real devuelve datos de otro cliente
  (o del cliente dueño de la API key), sin excepción.
- El código de dispositivo es único a nivel global; la pertenencia se determina con
  `cliente_id`.
- Toda consulta, modificación, suscripción en tiempo real y operación administrativa se
  restringe al `cliente_id` del usuario autenticado. El `cliente_id` sale del token o de
  la API key, nunca de la entrada del usuario.

**Usuarios**

- Solo un admin crea, modifica o elimina cuentas, y solo dentro de su cliente.
- Nadie elimina su propia cuenta ni deja a su cliente sin admin.

**Emparejamiento (configuración inicial del WiFi)**

- El modo de configuración se desactiva solo tras un tiempo límite (ej. 5 minutos) o al
  conectar por WiFi.
- Un dispositivo con credenciales guardadas no vuelve a anunciarse salvo reseteo forzado.

---

## 7. Contrato de la API

Autenticación: **JWT** en el header `Authorization`, sin prefijo `Bearer`, con rol y
`cliente_id` en el payload (expira a las 12 h); o **API key** en el header `X-Api-Key`
para `/api/public/*`.

| Método | Endpoint | Acceso |
|---|---|---|
| POST | `/api/auth/login` | Público |
| GET, PATCH | `/api/auth/me` | Autenticado |
| POST | `/api/auth/change-password` | Autenticado |
| GET | `/api/dispositivos`, `/api/dispositivos/estado` | Autenticado |
| POST | `/api/dispositivos` (alta o reclamo; 409 si pertenece a otro cliente) | Admin |
| DELETE | `/api/dispositivos/:codigo` (baja lógica) | Admin |
| GET | `/api/lecturas`, `/api/lecturas/ultima`, `/api/lecturas/agregado` | Autenticado |
| GET | `/api/umbrales` | Autenticado |
| POST | `/api/umbrales` | Admin |
| GET | `/api/alertas`, `/api/alertas/distribucion` | Autenticado |
| PATCH | `/api/alertas/:id` (estado y comentario opcional) | Autenticado |
| GET, POST | `/api/usuarios` | Admin |
| PATCH, DELETE | `/api/usuarios/:id` | Admin |
| GET | `/api/auditoria` | Admin |
| GET, POST | `/api/api-keys` | Admin |
| DELETE | `/api/api-keys/:id` (revocación) | Admin |
| GET | `/api/public/dispositivos`, `/api/public/lecturas`, `/api/public/alertas` | API key |
| GET | `/health` | Público |

**Eventos en tiempo real (Socket.io):** `lectura` y `alerta`. Se emiten al procesar una
lectura o generar una alerta, y deben llegar solo a usuarios autenticados del cliente
dueño del dispositivo.

**Contrato MQTT:** tópico `ecotrack/<deviceId>/lecturas`; payload JSON
`{ "temperatura": number, "humedad": number, "luminosidad": number }`. Rangos validados:
temperatura de -40 a 80 °C, humedad de 0 a 100 %, luminosidad de 0 a 100 %. El tópico y
el payload no cambian sin versionarse, porque hay firmware desplegado.

**Rate limiting (4.6.7 de la tesis):** login con máximo 5 intentos cada 15 minutos por
IP; API pública con máximo 100 solicitudes cada 5 minutos por clave (o por IP si no hay
clave).

---

## 8. Modelo de datos (resumen)

| Tabla | Campos clave |
|---|---|
| `clientes` | id, nombre (único), activo, creado_en |
| `usuarios` | id, username (único), password_hash (bcrypt), nombre, rol (`admin` o `comun`), cliente_id (obligatorio), token_version |
| `dispositivos` | id, codigo (único global), nombre, ubicacion, activo (baja lógica), cliente_id (nulo hasta que un admin lo reclama), ultima_conexion |
| `lecturas` | id, dispositivo_codigo, temperatura, humedad, luminosidad, timestamp |
| `umbrales` | id, dispositivo_codigo, variable, umbral_min, umbral_max, notificaciones_activas; único por (dispositivo, variable) |
| `alertas` | id, dispositivo_codigo, variable, valor, umbral_min, umbral_max, estado (`pendiente` o `atendida`), comentario (máx. 500), timestamp |
| `api_keys` | id, cliente_id, nombre, clave_hash (SHA-256), prefijo, activa, revocada_en, ultimo_uso, creado_por |
| auditoría | cliente, usuario, username al momento del hecho, acción, entidad, entidad_id, detalle, timestamp |

`lecturas`, `umbrales` y `alertas` no tienen `cliente_id` propio: se filtran por JOIN con
`dispositivos`.

**Privacidad:** no se procesan datos personales de terceros; las contraseñas se guardan
solo como hash; las credenciales de dispositivos y las API keys se guardan de forma
segura y fuera del control de versiones; se aplica minimización de datos.

---

## 9. Casos de uso

| ID | Caso de uso | Actor | Requisitos |
|---|---|---|---|
| CU01 | Iniciar sesión | Sin registrar | RF16, RI06, RNF08 |
| CU02 | Cerrar sesión | Autenticado | RI06 |
| CU03 | Ver panel principal en tiempo real | Autenticado | RF06, RF13, RI02, RI19 |
| CU04 | Consultar histórico de lecturas | Autenticado | RF07, RI03 |
| CU05 | Ver y editar perfil propio | Autenticado | RF20, RI09 |
| CU06 | Gestionar alertas | Autenticado | RF09, RF11, RI05, RI07 |
| CU07 | Gestionar dispositivos IoT | Admin | RF12, RF18 |
| CU08 | Configurar umbrales de alerta | Admin | RF08, RI04 |
| CU09 | Gestionar usuarios | Admin | RF16, RI08 |
| CU10 | Emparejar dispositivo (configuración inicial del WiFi) | Admin e ESP32 | RF15, RI13 |
| CU11 | Publicar lectura ambiental | ESP32 | RF01, RF03, RI21 |
| CU12 | Enrutar mensaje de lectura | Mosquitto | RI16, RI19 |
| CU13 | Consultar datos vía API pública | Sistema externo | RF19, RI20 |

---

## 10. Criterios de aceptación globales

1. **Pruebas:** integración mínima sobre autenticación, ingesta MQTT, generación de
   alertas y el flujo de aprovisionamiento.
2. **Validación:** todo input inválido (REST o MQTT) se rechaza con mensaje claro y, si
   corresponde, se registra en logs.
3. **Aislamiento:** ninguna consulta, autorizada o no, expone datos de otro cliente
   (RF18, RNF05).
4. **Trazabilidad:** toda acción administrativa queda registrada y consultable en
   auditoría.
5. **Seguridad por rol:** los endpoints administrativos rechazan a usuarios comunes,
   verificado con pruebas de autorización.
6. **Rendimiento:** se cumplen RE01 a RE06, incluida la latencia de eventos en tiempo real.
