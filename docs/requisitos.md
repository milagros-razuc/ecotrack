# EcoTrack IoT — Requisitos

Catálogo de requisitos normativos reconciliado con *Proyecto Final de Sistemas — EcoTrack*,
versión modificada el 2026-10-31, de Razuc Milagros y Cabrera Ramiro (UdeMM). La tesis
vigente es la autoridad para el texto de los requisitos y sus IDs.

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
| RF01 | El sistema debe capturar datos de temperatura, humedad y luminosidad de forma continua a través de sensores físicos conectados al microcontrolador ESP32. |
| RF02 | El sistema debe permitir configurar el intervalo de captura de datos según las necesidades del entorno monitoreado. |
| RF03 | El dispositivo IoT debe transmitir los datos capturados al backend de forma automática mediante conexión WiFi. |
| RF04 | El backend debe recibir los datos enviados por los dispositivos, validar su formato y coherencia, y rechazar o registrar aquellos que no cumplan los criterios definidos. |
| RF05 | El sistema debe almacenar los datos en una base de datos estructurada, asociándolos al cliente y dispositivo correspondiente. |
| RF06 | El sistema debe mostrar en tiempo real los valores actuales de temperatura, humedad y luminosidad a través de un dashboard, accesible desde cualquier dispositivo con navegador web. |
| RF07 | El sistema debe permitir al usuario consultar el historial de datos de uno o todos los dispositivos, por rango de fechas y agregado por día, semana o mes, visualizando cada variable ambiental. |
| RF08 | El sistema debe permitir configurar umbrales máximos y mínimos para cada variable ambiental. |
| RF09 | El sistema debe generar alertas automáticas cuando alguna variable supere o se encuentre por debajo de los umbrales configurados. |
| RF10 | El sistema debe notificar al usuario ante alertas activas mediante una notificación emergente (pop-up) dentro del dashboard, mientras se encuentra utilizando el sistema. |
| RF11 | El sistema debe registrar un log de alertas generadas, indicando variable, valor registrado, umbral superado, fecha y hora, y debe permitir gestionar su estado. |
| RF12 | El sistema debe permitir la gestión de dispositivos IoT asociados a un cliente: modificación de sus datos, baja y reclamo. El dispositivo se aprovisiona previamente mediante un script administrativo, y un administrador lo reclama presentando su token de reclamo (RF21). |
| RF13 | El sistema debe mostrar un panel de control con el estado general de los dispositivos, alertas activas y resumen de variables, correspondientes al cliente del usuario autenticado. |
| RF14 | El sistema debe registrar logs de actividad del sistema para auditoría y trazabilidad. |
| RF15 | El sistema debe soportar la configuración inicial de las credenciales WiFi del dispositivo ESP32 mediante un portal web de configuración, servido por el propio dispositivo en modo punto de acceso temporal y accesible desde cualquier celular o computadora con WiFi, sin aplicación dedicada |
| RF16 | El sistema debe permitir a un usuario con rol administrador crear, modificar y eliminar cuentas de usuario dentro de su cliente/organización, asignando a cada una un rol. |
| RF17 | El sistema debe restringir las funcionalidades administrativas exclusivamente a los usuarios con rol administrador. |
| RF18 | El sistema debe asociar cada dispositivo IoT a un cliente/cuenta determinado, de forma que cada usuario visualice y opere únicamente sobre los dispositivos, lecturas y alertas correspondientes a su cliente. |
| RF19 | El sistema debe exponer una API pública documentada que permita a sistemas externos autorizados consultar lecturas, alertas y estado de dispositivos de forma segura. |
| RF20 | El sistema debe permitir a cada usuario visualizar y editar los datos de su perfil personal, incluyendo el cambio de su contraseña. |
| RF21 | Un administrador puede reclamar un dispositivo sin dueño presentando su token de reclamo. El dispositivo queda asociado a su cliente y no puede ser reclamado por otro cliente mientras tenga dueño. |
| RF22 | El firmware debe almacenar temporalmente las lecturas tomadas mientras no hay conexión con el broker (hasta 360, equivalentes a 1 hora al intervalo por defecto) y reenviarlas en orden cronológico al reconectar. |
| RF23 | Cada lectura debe llevar la fecha y hora de captura (ts) cuando el dispositivo dispone de hora sincronizada. El backend almacena la lectura con ese valor; si no viene ts, usa la hora de recepción. |

---

## 3. Interfaces

### Usuario

| ID | Requisito |
|---|---|
| RI01 | Interfaz web (dashboard) accesible desde cualquier navegador moderno y distintos dispositivos, con pantallas de login, panel principal, histórico, auditoría, configuración, gestión de usuarios y perfil. |
| RI02 | El dashboard debe presentar los valores actuales mediante tarjetas con indicadores numéricos y barras de progreso, actualizados automáticamente sin recargar la página. |
| RI03 | Vista de histórico con gráficos de series temporales por variable, con selección de período de agregación, rango de fechas y filtro por dispositivo |
| RI04 | Pantalla de configuración donde un administrador defina umbrales mínimos y máximos por variable y dispositivo, y active/desactive notificaciones. |
| RI05 | Visualización de alertas activas mediante indicadores por estado (pendiente/atendida) y notificación emergente al generarse. |
| RI06 | Autenticación mediante usuario y contraseña; la interfaz debe adaptar las opciones según el rol del usuario autenticado. |
| RI07 | Pantalla de auditoría que permita listar, filtrar y paginar el historial de alertas, y gestionar su estado. |
| RI08 | Pantalla de gestión de usuarios, accesible únicamente para administradores, para crear, modificar y eliminar cuentas dentro de su cliente/organización. |
| RI09 | Pantalla de perfil de usuario, donde cualquier usuario autenticado pueda consultar y editar sus propios datos y contraseña. |

### Hardware

| ID | Requisito |
|---|---|
| RI10 | El ESP32 debe conectarse a un sensor de temperatura y humedad mediante protocolo digital de un solo cable (single-wire). |
| RI11 | El ESP32 debe conectarse a un sensor de luminosidad mediante fotorresistencia (LDR) en una entrada analógica (ADC). |
| RI12 | El dispositivo debe alimentarse mediante conexión USB (5V). |
| RI13 | El ESP32 debe poder operar temporalmente como punto de acceso WiFi (SoftAP) y servir una página de configuración HTTP, para ingresar los datos de la red del sitio |

### Software

| ID | Requisito |
|---|---|
| RI14 | El backend debe exponer una API REST organizada en capas, para la recepción de datos, la comunicación con el dashboard y su consumo por sistemas externos autorizados. |
| RI15 | Base de datos relacional para el almacenamiento estructurado de clientes, dispositivos, lecturas, umbrales, alertas y usuarios. |
| RI16 | El firmware debe implementarse con librerías específicas para lectura de sensores y comunicación inalámbrica (WiFi) y por mensajería. |
| RI17 | Autenticación basada en tokens, contraseñas con hash seguro y validación de datos mediante esquemas definidos; el esquema de autorización debe contemplar rol y cliente/organización. |
| RI18 | Dashboard desarrollado con tecnologías estándar del lado del cliente, consumiendo la API REST del backend. |
| RI19 | El backend debe emitir eventos en tiempo real hacia los clientes conectados, sin necesidad de consulta periódica. |
| RI20 | La API pública debe requerir un mecanismo de autenticación propio (ej. claves de API), independiente de las credenciales del dashboard, y contar con documentación técnica. |

### Comunicación

| ID | Requisito |
|---|---|
| RI21 | Comunicación entre dispositivo IoT y backend mediante protocolo publicación/suscripción, cada dispositivo publica sus lecturas en un tópico único asociado a su código de dispositivo. La identificación del cliente se resuelve en el backend.El acceso a cada tópico se restringe mediante ACL por dispositivo (RNF16) |
| RI22 | Los datos transmitidos deben utilizar formato estructurado JSON. |
| RI23 | Comunicación backend-dashboard mediante protocolo de transferencia de hipertexto, complementado con comunicación bidireccional para tiempo real. |
| RI24 | La conexión backend-bróker debe autenticarse con credenciales propias del backend, sobre TLS |
| RI25 | Las claves de API se almacenan únicamente como hash |

---

## 4. Eficiencia y diseño

| ID | Requisito |
|---|---|
| RE01 | Con 50 dispositivos activos enviando una lectura cada 10 s, el sistema debe procesar, almacenar, evaluar umbrales y emitir el evento en tiempo real en un tiempo ≤ 500 ms para el percentil 95 (p95), medido desde la recepción en el bróker. |
| RE02 | El dashboard debe reflejar una lectura nueva en ≤ 2 s (p95) desde su almacenamiento. Como respaldo, debe refrescarse cada 30 s si se pierde la conexión en tiempo real. |
| RE03 | El sistema debe soportar 50 dispositivos conectados simultáneamente, pertenecientes a al menos 5 clientes, con una latencia p95 que no supere en más de 20 % la medida con 5 dispositivos y sin pérdida de lecturas. |
| RE04 | Las consultas de historial agregado deben responder en ≤ 2 s (p95) para rangos de hasta 30 días de un dispositivo. |
| RE05 | El firmware del ESP32 debe usar como máximo el 60 % de la RAM disponible durante la operación normal y mantener el ciclo de lectura y envío dentro de su intervalo de captura, sin reinicios por falta de memoria durante 24 h continuas. |
| RE06 | Con 10 veces más clientes y lecturas registradas que en el caso base (RE03), los tiempos de RE01 y RE04 no deben aumentar más de 25 %. |
| RD01 | La comunicación inalámbrica debe cumplir con el estándar IEEE 802.11 (WiFi). |
| RD02 | La comunicación dispositivo-backend debe seguir el estándar MQTT (OASIS). |
| RD03 | El backend debe seguir los principios de arquitectura REST, con formato JSON. |
| RD04 | La autenticación debe basarse en un estándar abierto de tokens de sesión, con hash adaptativo para contraseñas. |
| RD05 | Se tomarán como referencia los lineamientos de la norma ISO/IEC 25010\. |
| RD06 | La configuración inicial de conectividad se basa en el estándar IEEE 802.11 (modo SoftAP) y en HTTP para el formulario de configuración |
| RD07 | El ESP32 posee recursos limitados de RAM y almacenamiento flash, por lo que el firmware debe diseñarse de forma liviana. |
| RD08 | Los sensores utilizados poseen una precisión acotada según el modelo elegido. |
| RD09 | El alcance de la conexión WiFi del ESP32 y de su punto de acceso de configuración está limitado por la cobertura y la distancia al dispositivo del usuario |
| RD10 | El sistema no contempla, en su versión inicial, redundancia de hardware ante fallas físicas. |

---

## 5. Requisitos no funcionales

| ID | Requisito |
|---|---|
| RNF01 | El acceso al dashboard debe requerir autenticación mediante credenciales verificadas por hash seguro, con sesiones gestionadas por tokens con expiración definida. |
| RNF02 | La comunicación entre dispositivos, bróker y backend debe cifrarse con TLS, y cada dispositivo debe autenticarse con credenciales propias e individuales. |
| RNF03 | El sistema debe validar los datos de entrada de todas las peticiones mediante esquemas definidos. |
| RNF04 | El sistema debe registrar el historial completo de eventos de alerta, con consulta y gestión desde auditoría. |
| RNF05 | El sistema debe garantizar el aislamiento lógico de los datos entre clientes, sin que ninguna consulta exponga información de otro cliente. |
| RNF06 | Las credenciales y secretos sensibles deben mantenerse fuera del control de versiones. Excepción aprobada para CU10: `EcoTrack.123` es un código SoftAP compartido e intencionalmente público; no se considera secreto ni mecanismo de exclusión frente a quien lo conozca (spec 019). |
| RNF07 | El código del backend debe organizarse en capas claramente diferenciadas. |
| RNF08 | El sistema debe contar con documentación técnica actualizada. |
| RNF09 | El código debe seguir convenciones de estilo y buenas prácticas. |
| RNF10 | El dashboard debe ser compatible con los principales navegadores web modernos. |
| RNF11 | El dashboard debe adaptarse a distintos tamaños de pantalla. |
| RNF12 | El backend debe poder desplegarse en distintos entornos de hosting. |
| RNF13 | Ante la caída del backend o del bróker, los dispositivos deben reconectarse automáticamente en ≤ 60 s una vez restablecido el servicio, sin intervención manual, y el sistema debe volver a operar con normalidad. |
| RNF14 | Un usuario sin capacitación previa debe completar las tareas principales (iniciar sesión, ver lecturas actuales, consultar el historial y gestionar una alerta) en ≤ 5 minutos, con una tasa de éxito ≥ 90 % en una prueba con al menos 5 usuarios. |
| RNF15 | El sistema debe ser escalable, permitiendo el registro de nuevos clientes y dispositivos sin rediseñar la estructura existente. |
| RNF16 | El bróker debe aplicar ACL por dispositivo: cada dispositivo solo puede publicar en su propio tópico. |
| RNF17 | Un dispositivo sin dueño solo puede ser reclamado presentando un token de reclamo único, aleatorio y de un solo uso. Conocer el código del dispositivo no debe alcanzar. |
| RNF18 | Cuando un dispositivo cambia de cliente, el nuevo cliente no debe poder acceder a las lecturas, alertas ni umbrales generados bajo el cliente anterior. |
| RNF19 | Las sesiones deben invalidarse de inmediato ante cambio de contraseña, cambio de rol o eliminación del usuario, incluidas las conexiones en tiempo real ya abiertas. |
| RNF20 | Los eventos en tiempo real solo deben entregarse a usuarios autenticados del cliente dueño del dispositivo. El cliente se toma del token y no de datos enviados por el navegador, y no se emiten eventos de dispositivos sin cliente. |
| RNF21 | El sistema debe limitar los intentos de acceso: 5 por cada 15 minutos por IP en el login y, en la API pública, 100 por cada 5 minutos por clave de API y 300 por cada 5 minutos por IP. |
| RNF22 | Las lecturas reenviadas con más de 5 minutos de atraso se almacenan pero no generan alertas ni eventos en tiempo real. |

---

## 6. Reglas de negocio

Las reglas del dominio de la tesis se resumen aquí; los criterios de implementación que no figuran como requisito se identifican al final de esta sección.

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
- Las lecturas y alertas conservan el `cliente_id` del propietario que tenía el
  dispositivo cuando se generaron; esa pertenencia histórica no cambia al transferirlo.

**Usuarios**

- Solo un admin crea, modifica o elimina cuentas, y solo dentro de su cliente.
- Nadie elimina su propia cuenta ni deja a su cliente sin admin.
- Cambiar la contraseña o el rol de un usuario invalida todas sus sesiones abiertas (`token_version` + desconexión de sus sockets). En el cambio de contraseña se incluye la sesión que originó el cambio: debe iniciar sesión de nuevo.

**Configuración inicial del WiFi**

- El portal SoftAP es temporal y permite cargar las credenciales de la red del sitio (RF15, RI13, RD06). La implementación exige WPA2 con el código compartido `EcoTrack.123`, sin PIN de formulario. Como el código es público e igual para todos los equipos, cualquier persona que lo conozca puede asociarse; WPA2 cifra el enlace de radio, pero no proporciona TLS hasta el navegador ni protege los datos una vez recibidos por el ESP32 (spec 019). La tesis no fija un tiempo exacto de cierre.

**Lecturas diferidas**

- Una lectura con `ts` se almacena con ese valor. Se rechaza si `ts` es más de 1 minuto
  en el futuro o más de 24 horas en el pasado respecto de la recepción (RF23; regla de
  negocio de §3.5 de la tesis).
- Una lectura con `ts` anterior a `reclamado_en` se descarta sin persistirla ni producir
  alertas o eventos en tiempo real (RF23, RNF18 y RNF19; regla de §3.5). La referencia
  `RNF18` en la tesis se interpreta junto con el requisito vigente de no exponer datos
  históricos al propietario posterior (RNF18) y el descarte de mensajes sin dueño (RNF19).
- Una lectura con más de 5 minutos de atraso se almacena, pero no genera alertas ni se
  emite por tiempo real. Las lecturas con atraso de hasta 5 minutos conservan el flujo
  normal.

**Baja y liberación de dispositivos**

- La baja no borra el dispositivo: lo deja inactivo, sin propietario, nombre, ubicación ni
  umbrales, y con `token_reclamo_hash = NULL`.
- Las lecturas y alertas históricas se conservan asociadas al cliente que era propietario.
- Mientras el dispositivo no tenga propietario, sus mensajes MQTT se descartan sin
  persistirse y queda disponible para un nuevo reclamo luego de una rotación explícita.

**Configuración vigente de implementación (informativa; no requisito de tesis)**

- Con `NODE_ENV=production` no existen credenciales por defecto: el arranque falla si
  falta `ADMIN_PASS`, y no se crea el usuario de prueba.
- Los orígenes permitidos por CORS (API REST y Socket.io) se configuran por entorno
  (`CORS_ORIGIN`); no se aceptan orígenes arbitrarios.


### Criterios adicionales fuera de las 86 filas normativas (pendientes de decisión o confirmación)

Los siguientes detalles provienen de decisiones de diseño, implementación o requisitos que no están expresados con ese nivel de precisión en las tablas de la tesis. Se conservan para trazabilidad, pero no deben usarse como criterio normativo hasta que se acuerden y se vinculen a la spec correspondiente. Ver el [crosswalk de R1](../specs/012-alinear-requisitos-tesis/crosswalk.md).

- Pérdida máxima de 1 % durante una caída de una hora; la tesis define capacidad/orden del buffer (RF22), no ese porcentaje.
- Hash del token de reclamo, atomicidad del reclamo/baja/rotación y auditoría de esos eventos, más allá de RF14 y RNF17.
- Particionado temporal de lecturas diferidas.
- Descartar mensajes con timestamp anterior a `reclamado_en` y mensajes de dispositivos sin propietario: se conservan como reglas de dominio de §3.5, pero requieren corregir la referencia de ID heredada en la tesis y validar el comportamiento al implementar.
- Política actual del login: 5 intentos por combinación IP/username, 30 por IP y 20 por username en 15 minutos. No cumple por sí sola RNF21, que fija 5 por IP; debe resolverse en su propia fase. También son criterios adicionales la protección contra la eliminación propia o del último administrador del cliente y el umbral exacto de 2 minutos para clasificar un dispositivo como online.
- Tiempo exacto para cerrar el portal SoftAP, reingreso por botón BOOT y condición de cierre tras conexión WiFi/MQTT.
- Para RF02, rango/unidad del intervalo, estado deseado/reportado, persistencia y confirmación del dispositivo; la decisión de configurar desde el dashboard y la coordinación con MQTT se planifican en R4, después de R3.

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
| POST | `/api/dispositivos` (reclamo con `codigo` y `token_reclamo`; 409 si falla) | Admin |
| DELETE | `/api/dispositivos/:codigo` (baja lógica; responde 204 sin cuerpo) | Admin |
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

**Contrato MQTT:** el canal operativo usa MQTTS sobre TLS en el puerto `8883`; tópico
`ecotrack/<deviceId>/lecturas`; payload JSON
`{ "temperatura": number, "humedad": number, "luminosidad": number, "ts": number? }`.
`ts` es opcional y representa la fecha de captura como segundos Unix UTC. Rangos validados:
temperatura de -40 a 80 °C, humedad de 0 a 100 %, luminosidad de 0 a 100 %. El tópico y
el payload no cambian sin versionarse, porque hay firmware desplegado. El listener sin
cifrado en `1883` permanece cerrado. Backend y clientes que ya soporten TLS deben validar
el certificado del broker contra el CA configurado y el nombre incluido en el SAN.

**Rate limiting (RNF21):** el requisito establece 5 intentos de login por IP en cada ventana de 15 minutos y, para la API pública, 100 solicitudes por clave y 300 por IP en cada ventana de 5 minutos. La diferencia entre estos criterios y el limitador de login actual se registra entre los criterios adicionales de esta sección.

---

## 8. Modelo de datos (resumen)

| Tabla | Campos clave |
|---|---|
| `clientes` | id, nombre (único), activo, creado_en |
| `usuarios` | id, username (único), password_hash (bcrypt), nombre, rol (`admin` o `comun`), cliente_id (obligatorio), token_version |
| `dispositivos` | id, codigo (único global), nombre, ubicacion, activo (baja lógica), cliente_id (nulo hasta que un admin lo reclama), ultima_conexion, reclamado_en, token_reclamo_hash |
| `lecturas` | id, dispositivo_codigo, cliente_id (propietario al insertar), temperatura, humedad, luminosidad, timestamp de captura |
| `umbrales` | id, dispositivo_codigo, variable, umbral_min, umbral_max, notificaciones_activas; único por (dispositivo, variable) |
| `alertas` | id, dispositivo_codigo, cliente_id (propietario al generar), variable, valor, umbral_min, umbral_max, estado (`pendiente` o `atendida`), comentario (máx. 500), timestamp |
| `api_keys` | id, cliente_id, nombre, clave_hash (SHA-256), prefijo, activa, revocada_en, ultimo_uso, creado_por |
| auditoría | cliente, usuario, username al momento del hecho, acción, entidad, entidad_id, detalle, timestamp |

`lecturas` y `alertas` tienen `cliente_id` propio, capturado al insertar o generar el
registro. Se filtran por ese valor y no por el propietario actual del dispositivo.

**Privacidad:** no se procesan datos personales de terceros; las contraseñas se guardan
solo como hash; las credenciales de dispositivos y las API keys se guardan de forma
segura y fuera del control de versiones; se aplica minimización de datos.

---

## 9. Casos de uso

| ID | Caso de uso | Actor | Requisitos |
|---|---|---|---|
| CU01 | Iniciar sesión | Sin registrar | RI06, RNF01, RNF05, RNF21 |
| CU02 | Cerrar sesión | Autenticado | RI06, RNF19 |
| CU03 | Ver panel principal en tiempo real | Autenticado | RF06, RF13, RI02, RI19, RNF20 |
| CU04 | Consultar histórico de lecturas | Autenticado | RF07, RI03, RE04, RNF18 |
| CU05 | Ver y editar perfil propio | Autenticado | RF20, RI09, RNF19 |
| CU06 | Gestionar alertas | Autenticado | RF09, RF10, RF11, RI05, RI07, RNF04, RNF18 |
| CU07 | Aprovisionar, reclamar, modificar y liberar dispositivos IoT | Operador y Admin | RF12, RF14, RF17, RF18, RF21, RNF17, RNF18 |
| CU08 | Configurar umbrales de alerta | Admin | RF08, RF14, RF17, RI04 |
| CU09 | Gestionar usuarios | Admin | RF14, RF16, RF17, RI08, RNF19 |
| CU10 | Configurar conectividad mediante portal SoftAP | Admin y ESP32 | RF15, RI13, RD06 |
| CU11 | Capturar y publicar lectura ambiental, incluso diferida | ESP32 | RF01, RF02, RF03, RI16, RI21, RI22, RNF16, RF22, RF23 |
| CU12 | Recibir y procesar mensaje de lectura | Backend | RF04, RF05, RF09, RF10, RI19, RI21, RI24, RNF20, RNF18, RF23, RNF22 |
| CU13 | Consultar datos vía API pública | Sistema externo | RF19, RI20, RI25, RNF21 |

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
