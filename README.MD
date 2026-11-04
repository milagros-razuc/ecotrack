# EcoTrack IoT 🌱

Sistema de monitoreo ambiental basado en IoT que captura, transmite y visualiza datos de temperatura, humedad y luminosidad en tiempo real.

Desarrollado como proyecto de tesis — Ingeniería en Sistemas, UdeMM.
**Autores:** Razuc Milagros · Cabrera Ramiro

---

## Arquitectura

```
ESP32 (DHT11 + LDR)
       │
       │ MQTTS/TLS 1.2 (8883)
       │ topic: ecotrack/<deviceId>/lecturas
       ▼
 Mosquitto (broker TLS)
       │
       │ suscripción
       ▼
 Backend (Node.js + Express)
       │
       ├──► PostgreSQL (almacenamiento)
       │
       └──► Caddy HTTPS (única entrada pública, puerto 443)
                │
                ▼
         Frontend (nginx, red interna)
```

---

## Requisitos

- Docker Desktop
- Arduino IDE (para programar el ESP32)
- Python 3 con el paquete `esp-idf-nvs-partition-gen`
- NodeMCU ESP32S de 38 pines
- Sensor DHT11
- Fotorresistencia LDR + resistencia 10K

---

## Instalar desde cero

### 1. Clonar el repositorio

```powershell
git clone https://github.com/TU_USUARIO/ecotrack.git
cd ecotrack
```

### 2. Crear los archivos `.env`

El repositorio no contiene un `.env.example` en la raíz. El único ejemplo verificado es
[`backend/.env.example`](backend/.env.example), que lista PostgreSQL, `MQTT_PUBLIC_HOST`,
credenciales de Dynamic Security, `PORT`, `JWT_SECRET`, usuarios iniciales y
`CORS_ORIGIN`. Creá la configuración local sin pegar secretos en el repositorio:

```powershell
Copy-Item backend\.env.example backend\.env
```

Además, creá el `.env` de la raíz con las variables que consume
[`docker-compose.yml`](docker-compose.yml), incluyendo `MQTT_PUBLIC_HOST` y las
credenciales de PostgreSQL/Dynamic Security. `PUBLIC_HOST` es el nombre de entorno que
Caddy recibe desde `MQTT_PUBLIC_HOST`; el host debe ser el nombre o la IP real del
servidor, no un ejemplo como `broker.ecotrack.local`.

### 3. Preparar certificados del broker

La CA y el certificado del broker no se generan desde archivos versionados completos.
Generá los certificados locales con el host que usará el ESP32:

```powershell
.\scripts\generate-mqtt-certs.ps1 -HostIp <IP-o-host-del-servidor>
```

El script genera la CA del broker, `broker.crt` y sus claves bajo
`mosquitto\config\certs`; copia la CA pública a `codigo-esp32-mosquitto\certs`. Las
claves privadas y el certificado del broker están ignorados por Git. Reservá la IP del
servidor en el router: queda grabada en el NVS y el certificado del broker se emite para
esa IP.

### 4. Preparar la CA de enrolamiento y levantar Docker

La CA de Caddy es distinta de la CA del broker. Extraé la raíz de Caddy y usala para
generar localmente `codigo-esp32-mosquitto\enroll_ca.h` a partir de
`enroll_ca.h.example`:

```powershell
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt .\caddy-root.crt
```

No agregues `enroll_ca.h` al repositorio: está ignorado por Git. Luego iniciá los
servicios:

```powershell
docker compose up --build
```

Caddy publica únicamente `443`. El backend (`3000`) y el frontend (`8080` o `80`
interno) no son puertos de acceso del usuario.

### 5. Firewall y acceso

En Windows, permití `443` y `8883` únicamente para el perfil **Private**. El dashboard se
abre en `https://localhost` o `https://<IP del servidor>`. Caddy enruta `/api/*`,
`/socket.io/*` y `/health` al backend; el resto se sirve desde nginx.

| Servicio | URL |
|---|---|
| Dashboard | https://localhost/login.html |
| API REST | https://localhost/api |
| Healthcheck | https://localhost/health |

---

## Configuración del ESP32

### Conexiones físicas

| Componente | Pin componente | Pin ESP32 |
|---|---|---|
| DHT11 — VCC | + | 3V3 |
| DHT11 — GND | - | GND |
| DHT11 — DATA | S | P4 (GPIO4) |
| LDR — Pin 1 | — | 3V3 |
| LDR — Pin 2 | — | P34 (GPIO34) |
| Resistencia 10K | — | P34 → GND |

### Identidad y credenciales del dispositivo

La identidad de fábrica (`device_id`, PIN de instalación, `serverHost`, clave SoftAP
opcional y secreto reservado) se genera por dispositivo y se carga en NVS mediante el
procedimiento de fabricación. El `serverHost` queda grabado de fábrica. El SoftAP de
configuración es abierto pero temporal:
el portal exige primero el PIN de 6 dígitos, bloquea cinco intentos incorrectos durante
5 minutos y se apaga como máximo a los 10 minutos. Durante ese tramo, el PIN y la
clave WiFi viajan sin cifrar dentro de la red local del SoftAP. No se deben agregar
secretos a `esp32Secret.h.example`, al sketch ni al repositorio (RNF06), ni se imprimen
por serial. Los campos `mqttHost`, `mqttUser` y `mqttPass` solo se compilan cuando se
define `ECOTRACK_DEV_PORTAL`; esa macro queda apagada por defecto.

> **Estado TLS del firmware**: el firmware valida la hora por NTP, usa `WiFiClientSecure`
> con la CA de EcoTrack y conecta al listener MQTTS autenticado en `8883`. El tópico y el
> formato JSON de lecturas se mantienen compatibles con Mosquitto y el backend.

### Esquema de particiones y reflasheo

El archivo [`partitions.csv`](codigo-esp32-mosquitto/partitions.csv) define el layout
estándar Minimal SPIFFS: NVS en `0x9000` (`0x5000`), `otadata` en `0xE000`
(`0x2000`), dos slots de aplicación (`app0` y `app1`) de `0x1E0000` y
`littlefs` en `0x3D0000` (`0x20000`). Como este repositorio usa Arduino IDE y no
PlatformIO, copiá el archivo al directorio `tools/partitions` del paquete ESP32 instalado y
seleccioná el esquema equivalente desde **Herramientas > Partition Scheme**. El cambio
exige reflashear por USB; después cargá la imagen NVS de fábrica, porque el borrado de
flash puede eliminar la configuración anterior.

## Fabricar y enrolar un dispositivo

El flujo es por dispositivo y la carpeta de salida debe estar fuera del repositorio.
Reemplazá `<host>` por el host o IP estable del servidor:

1. Generá la identidad y el NVS:

   ```powershell
   python scripts\provision_factory.py --count 1 --output <carpeta-fuera-del-repo> --server-host <host> --nvs-size 0x5000 --export-backend
   ```

   La salida contiene `backend.csv`, `<id>.nvs.bin`, `<id>.label.txt` y `factory.csv`.
   Conservá los archivos de fábrica fuera del repositorio y no expongas sus secretos.
2. Copiá `backend.csv` al contenedor backend, importalo con el único argumento
   permitido (una ruta fuera del repositorio) y eliminá el CSV temporal:

   ```powershell
   docker cp <carpeta-fuera-del-repo>\backend.csv ecotrack_backend:/tmp/backend.csv
   docker compose exec backend node scripts/import-factory-devices.js /tmp/backend.csv
   docker compose exec backend rm /tmp/backend.csv
   ```

   La importación acepta un solo argumento y exige que la ruta esté fuera del
   repositorio. Usa `dispositivos_fabrica`; su estado de enrolamiento está en
   `enrolled_at`.
3. Generá el token de reclamo una sola vez:

   ```powershell
   docker compose exec backend node scripts/provision-device.js <id>
   ```

   Guardá el token en un medio seguro: no se puede recuperar desde la base.
4. En Arduino IDE, seleccioná **Erase All Flash Before Sketch Upload: Disabled** y
   cargá el firmware.
5. Después del firmware, escribí el NVS en `0x9000` con tamaño `0x5000` usando
   `<id>.nvs.bin`.
6. Encendé el ESP32. Abrirá `EcoTrack-Setup-<sufijo>` y el portal estará en
   `http://192.168.4.1/`. Ingresá el PIN de 6 dígitos; después de cinco intentos
   fallidos queda bloqueado. El dispositivo sincroniza NTP y llama a
   `POST /api/dispositivos/enrolar`. Mientras no esté reclamado recibe el `409`
   genérico y reintenta con backoff.
7. En el dashboard, como admin, reclamá el dispositivo pegando el token. En el
   siguiente reintento el backend crea el rol, tres ACL y el cliente de Dynamic
   Security, y devuelve las credenciales MQTT. El ESP32 las guarda en NVS y no vuelve
   a enrolar después de reiniciar.

Al compilar, registrá el tamaño de firmware y la capacidad de la partición de aplicación:

`porcentaje usado = bytes del firmware / bytes disponibles del slot × 100`

La salida de compilación debe conservarse junto con la evidencia de instalación. Esta
feature prepara el layout para OTA futuro, pero no implementa OTA.

Al compilar, registrá el tamaño de firmware y la capacidad de la partición de aplicación:

`porcentaje usado = bytes del firmware / bytes disponibles del slot × 100`

La salida de compilación debe conservarse junto con la evidencia de instalación. Esta
feature prepara el layout para OTA futuro, pero no implementa OTA.

**Estado actual de RF02:** el sketch permite ajustar el intervalo al compilar mediante `INTERVALO_CAPTURA_MS` en `esp32Secret.h` o con el build flag `-DINTERVALO_CAPTURA_MS=5000`; por defecto usa 10 segundos. Esto no implementa aún la configuración desde el dashboard ni la confirmación del valor aplicado por dispositivo. Ese flujo está planificado en R4 y depende del cierre de autenticación MQTT en R3 ([roadmap](ROADMAP.md)).

### Librerías necesarias (Arduino IDE)

- `DHT sensor library` — Adafruit
- `Adafruit Unified Sensor` — Adafruit
- `PubSubClient` — Nick O'Leary

---

## Autenticación y roles

El login usa JWT (`jsonwebtoken`) con contraseñas hasheadas por `bcrypt`. Cada token incluye el `rol` del usuario (`admin` o `comun`), que el middleware `verificarRol('admin')` usa para restringir los endpoints de administración. Un usuario común puede loguearse, ver el dashboard, histórico y auditoría, y gestionar el estado de las alertas — pero no puede dar de alta/baja dispositivos, tocar umbrales, ni gestionar otros usuarios. El frontend refleja esto mismo del lado del cliente (oculta o deshabilita esas acciones), aunque la restricción real siempre la aplica el backend.

---

## Endpoints de la API

| Método | Endpoint | Descripción | Acceso |
|---|---|---|---|
| POST | `/api/auth/login` | Autenticación, devuelve token | Público |
| GET | `/api/auth/me` | Datos del perfil propio | Autenticado |
| PATCH | `/api/auth/me` | Editar el nombre del perfil propio | Autenticado |
| POST | `/api/auth/change-password` | Cambiar la contraseña propia | Autenticado |
| GET | `/api/dispositivos` | Lista los dispositivos activos | Autenticado |
| GET | `/api/dispositivos/estado` | Lista con estado online/offline/nunca conectado | Autenticado |
| POST | `/api/dispositivos` | Alta o modificación de un dispositivo | Admin |
| DELETE | `/api/dispositivos/:codigo` | Baja: libera el dispositivo (sin dueño, inactivo, token revocado) y responde 204 | Admin |
| GET | `/api/lecturas` | Últimas lecturas (`dispositivo`, `limite`) | Autenticado |
| GET | `/api/lecturas/ultima` | Última lectura por cada dispositivo | Autenticado |
| GET | `/api/lecturas/agregado` | Series agregadas para el histórico (`dispositivo`, `periodo=dia\|semana\|mes`) | Autenticado |
| GET | `/api/umbrales` | Umbrales configurados (`dispositivo`) | Autenticado |
| POST | `/api/umbrales` | Crea o actualiza un umbral | Admin |
| GET | `/api/alertas` | Lista paginada y filtrable (`estado`, `dispositivo`, `variable`, `fechaDesde`, `fechaHasta`) | Autenticado |
| GET | `/api/alertas/distribucion` | Cantidad de alertas por variable | Autenticado |
| PATCH | `/api/alertas/:id` | Cambia el estado de una alerta, con comentario opcional | Autenticado |
| GET, POST | `/api/api-keys` | Listar y crear claves para el cliente; la clave nueva se muestra una sola vez | Admin |
| DELETE | `/api/api-keys/:id` | Revocar una clave del cliente | Admin |
| GET | `/api/public/dispositivos` | Listar dispositivos asociados a la API key | API key (`X-Api-Key`) |
| GET | `/api/public/lecturas` | Consultar lecturas (`dispositivo`, `limite`) | API key (`X-Api-Key`) |
| GET | `/api/public/alertas` | Consultar alertas (`dispositivo`, `estado`, `variable`, `pagina`, `limite`, fechas) | API key (`X-Api-Key`) |
| GET | `/api/usuarios` | Lista los usuarios | Admin |
| POST | `/api/usuarios` | Alta de usuario | Admin |
| PATCH | `/api/usuarios/:id` | Modifica nombre y/o rol | Admin |
| DELETE | `/api/usuarios/:id` | Elimina un usuario | Admin |
| GET | `/health` | Healthcheck del backend | Público |

### Aprovisionamiento y reclamo seguro

Un dispositivo nuevo se aprovisiona con un token de un solo uso desde `backend/`:

```powershell
node scripts/provision-device.js <id>
```

- El token se imprime **una sola vez**. En la base solo se guarda su hash
  SHA-256 (64 caracteres), por lo que no se puede recuperar.
- La rotación de token y los dispositivos existentes deben seguir el procedimiento
  operativo definido para cada entorno; no se deben inventar tokens ni secretos.

El administrador reclama desde `https://<host>` pegando el token. El reclamo es
atómico. El endpoint de enrolamiento del ESP32 es `POST /api/dispositivos/enrolar`;
todos los rechazos (incluido un dispositivo aún no reclamado) responden `409` con el
mismo error genérico: `No se pudo enrolar el dispositivo`.

La baja (`DELETE /api/dispositivos/:codigo`) responde `204` sin cuerpo. Deja el
dispositivo sin dueño, inactivo, sin nombre, ubicación ni umbrales, y sin token
válido. El histórico de lecturas y alertas se conserva para el cliente anterior.
Para reutilizarlo, el operador debe generar un token nuevo con `--rotate`.

### Ejemplo de request al login

```powershell
curl.exe --cacert "$env:TEMP\ecotrack-caddy-root.crt" `
  -X POST https://localhost/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"username":"admin","password":"tu_pass"}'
```

El resto de los endpoints protegidos esperan el token crudo (sin el prefijo `Bearer `) en el header `Authorization`.

### Ejemplo de payload del ESP32

```json
{
  "temperatura": 23.4,
  "humedad": 47.0,
  "luminosidad": 65
}
```

Topic MQTT: `ecotrack/ESP32-001/lecturas`. El backend valida el payload contra un esquema Zod antes de guardarlo (rangos físicos amplios, solo para descartar basura de sensor/transmisión, no para reemplazar los umbrales configurables).

---

## Certificados y CA

EcoTrack usa dos CA distintas:

- **CA de Caddy:** valida HTTPS para el enrolamiento. La raíz se extrae de
  `caddy:/data/caddy/pki/authorities/local/root.crt` y se embebe localmente en
  `codigo-esp32-mosquitto\enroll_ca.h` como `kEnrollCa`. Ese archivo está ignorado
  por Git. Si se pierde el volumen `caddy_data`, Caddy crea una CA nueva: hay que
  volver a extraerla, re-embebirla y re-flashear el firmware.
- **CA del broker:** es `kEcotrackCa`, en
  `codigo-esp32-mosquitto\ecotrack_ca.h`, y corresponde a la CA que firma el
  certificado MQTT. El certificado público del broker también se copia a
  `codigo-esp32-mosquitto\certs\ecotrack-ca.crt`.

No mezcles estas CA ni uses `setInsecure()`. Las claves privadas, los certificados
locales del broker y los secretos quedan fuera del repositorio.

## Problemas conocidos

- **SNI al conectar por IP:** `caddy/Caddyfile` define `default_sni {$PUBLIC_HOST}`.
  Sin ese bloque, clientes sin SNI (curl/Schannel, Node o ESP32) reciben una alerta
  TLS interna. Con él, Node puede validar la CA de Caddy y el SAN incluye la IP.
- **Node 18:** el `node --test` del contenedor no admite `--test-timeout` ni
  `--test-concurrency`; por eso `npm test` falla allí. Desde el host, Node >= 20
  ejecuta correctamente esos flags.
- **Pruebas de integración:** usan `TEST_DATABASE_URL` y solo aceptan bases
  `hardening_*` o `*_test`. `reclamo-dispositivo` lee `../frontend/index.html`;
  dentro del contenedor falla por esa ruta y desde el host pasa.
- **Perfiles de Windows:** las reglas de firewall para `443` y `8883` deben limitarse
  al perfil **Private**. No las abras para todos los perfiles.
- **Backoff:** un dispositivo no reclamado recibe el `409` genérico y reintenta con
  backoff; no es necesario intervenir el firmware durante ese estado.

## Pendientes confirmados como pendientes

Estos puntos no se presentan como implementados:

- endpoint de reseteo de credenciales (no hay spec);
- E6;
- auditoría del reclamo;
- pruebas `mqtt-acl` y `mqtt-tls` con Docker en el host;
- tests 12 y 14 de trazabilidad-alertas;
- informe de dónde está la clave de la CA del proyecto;
- pasaje a producción: dominio, certificado público y SAN del broker.

---

## Modelo de datos

```sql
dispositivos
  id, codigo (único), nombre, ubicacion, activo, creado_en, ultima_conexion

dispositivos_fabrica
  device_id, factory_secret_hash, created_at, enrolled_at

lecturas
  id, dispositivo_codigo (FK), temperatura, humedad, luminosidad, timestamp

alertas
  id, dispositivo_codigo, variable, valor, umbral_min, umbral_max,
  estado (pendiente|atendida), comentario, timestamp

umbrales
  id, dispositivo_codigo (FK), variable, umbral_min, umbral_max,
  notificaciones_activas, UNIQUE(dispositivo_codigo, variable)

usuarios
  id, username (único), password_hash, nombre, rol (admin|comun),
  cliente_id (FK, obligatorio), creado_en

clientes
  id, nombre (único), activo, creado_en
```

> El modelo multi-cliente está cerrado: `clientes` y `cliente_id` filtran cada query de `dispositivos`, `lecturas`, `umbrales`, `alertas` (vía JOIN, ya que `alertas` no tiene `cliente_id` propio) y `usuarios`. El JWT lleva `clienteId`, y el middleware `extraerCliente` rechaza con 401 cualquier token viejo sin ese campo, en vez de dejarlo pasar sin aislamiento. Único punto abierto: el tópico MQTT sigue siendo `ecotrack/<codigo>/lecturas` sin `cliente_id`, por lo que el código de dispositivo se mantiene único a nivel global (no por cliente) — ver la nota de diseño en `dispositivos.service.js`.

> `dispositivos.activo` implementa la baja lógica: un dispositivo dado de baja no se borra (para no perder su histórico de lecturas/alertas ni romper la FK). Queda sin dueño, inactivo y sin token válido, deja de listarse y sus mensajes MQTT se descartan sin guardarse hasta que un operador lo vuelva a aprovisionar con `--rotate` y un administrador lo reclame.

---

## Usuarios por defecto

Se crean automáticamente la primera vez que se levanta la base, con las credenciales definidas en `backend/.env`:

| Usuario | Rol | Definido por |
|---|---|---|
| `ADMIN_USER` (por defecto `admin`) | admin | `ADMIN_PASS` |
| `TEST_USER` (por defecto `operario1`) | comun | `TEST_USER_PASS` |

Desde ahí, cualquier usuario admin puede crear, editar o eliminar cuentas desde la pantalla de Usuarios (o vía `POST /api/usuarios`).

---

## Estructura del proyecto

```
ecotrack/
├── docker-compose.yml
├── .gitignore
├── README.MD
├── backend/
│   ├── .env.example
│   ├── Dockerfile
│   ├── package.json
│   ├── index.js
│   └── src/
│       ├── app.js
│       ├── migrate.js
│       ├── schemas.js
│       ├── config/
│       │   └── db.js
│       ├── middleware/
│       │   ├── auth.js
│       │   ├── rol.js
│       │   ├── validar.js
│       │   └── errorHandler.js
│       ├── mqtt/
│       │   └── client.js
│       ├── routes/
│       │   ├── auth.js
│       │   ├── dispositivos.js
│       │   ├── lecturas.js
│       │   ├── umbrales.js
│       │   ├── alertas.js
│       │   └── usuarios.js
│       ├── services/
│       │   ├── auth.service.js
│       │   ├── dispositivos.service.js
│       │   ├── lecturas.service.js
│       │   ├── umbrales.service.js
│       │   ├── alertas.service.js
│       │   └── usuarios.service.js
│       └── test/
│           └── usuarios.service.test.js
├── mosquitto/
│   ├── Dockerfile
│   └── config/
│       ├── mosquitto.conf
│       ├── acl.conf
│       ├── certs/
│       │   ├── ecotrack-ca.crt
│       │   ├── broker.crt          ← generado localmente, no se versiona
│       │   └── *.key               ← claves privadas, no se versionan
│       ├── passwd                   ← NO se versiona, generarlo manualmente
│       ├── passwd.test              ← solo entorno de test
│       └── mosquitto.test.conf      ← solo entorno de test
└── frontend/
    ├── index.html
    ├── login.html
    ├── historico.html
    ├── configuracion.html
    ├── auditor.html
    ├── usuarios.html
    └── shared/
        ├── app.js
        ├── sidebar.html
        ├── common.css
        ├── tailwind-config.js
        └── ecotrack-logo.png
```

---

## Trabajo futuro

- [x] Modelo multi-cliente (RF18/RNF05): tabla `clientes`, `cliente_id` en `usuarios` y `dispositivos`, con aislamiento de datos completo — DB, middleware `extraerCliente`, filtro por `cliente_id` en los 5 services y las 5 rutas. El frontend no necesitó cambios: el filtro viaja en el token de forma transparente
- [x] Portal web temporal de configuración WiFi por SoftAP (RF15/RI13); el aprovisionamiento de fábrica guarda identidad por dispositivo en NVS. La aceptación física y de rendimiento sigue pendiente (R10).
- [x] API pública de solo lectura con API key (RF19/RI20); queda pendiente decidir el contrato de estado de dispositivos y completar la cobertura de claves inválidas/revocadas y aislamiento (R8).
- [ ] Alinear el rate limit del login con RNF21: hoy el código permite 5 intentos por combinación IP/usuario y 30 por IP cada 15 minutos; el requisito define 5 por IP. La API pública sí aplica 100 por clave y 300 por IP cada 5 minutos.
- [ ] Recuperación de contraseña por email
- [ ] Sensores mejorados: DHT22 + BH1750
- [ ] Integración con LLM para análisis de tendencias ambientales
- [ ] Soporte multi-dispositivo probado en producción a mayor escala

---

## Tecnologías utilizadas

| Capa | Tecnología |
|---|---|
| Hardware | NodeMCU ESP32S, DHT11, LDR |
| Comunicación | MQTT (Eclipse Mosquitto) |
| Backend | Node.js, Express, pg, JWT, bcrypt, Zod |
| Base de datos | PostgreSQL 15 |
| Frontend | HTML, Tailwind CSS, Chart.js |
| Infraestructura | Docker, Docker Compose, nginx |
