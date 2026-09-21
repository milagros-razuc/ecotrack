# EcoTrack IoT 🌱

Sistema de monitoreo ambiental basado en IoT que captura, transmite y visualiza datos de temperatura, humedad y luminosidad en tiempo real.

Desarrollado como proyecto de tesis — Ingeniería en Sistemas, UdeMM.
**Autores:** Razuc Milagros · Cabrera Ramiro

---

## Arquitectura

```
ESP32 (DHT11 + LDR)
       │
       │ MQTT (topic: ecotrack/<deviceId>/lecturas)
       ▼
 Mosquitto (broker)
       │
       │ suscripción
       ▼
 Backend (Node.js + Express)
       │
       ├──► PostgreSQL (almacenamiento)
       │
       └──► API REST (puerto 3000)
                │
                ▼
         Frontend (nginx, puerto 8080)
```

---

## Requisitos

- Docker Desktop
- Arduino IDE (para programar el ESP32)
- NodeMCU ESP32S de 38 pines
- Sensor DHT11
- Fotorresistencia LDR + resistencia 10K

---

## Instalación y configuración

### 1. Clonar el repositorio

```bash
git clone https://github.com/TU_USUARIO/ecotrack.git
cd ecotrack
```

### 2. Configurar variables de entorno

Copiá los archivos de ejemplo y completá con tus valores:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Editá `.env` con las credenciales de Postgres y `backend/.env` con todos los parámetros de conexión, más:

```
JWT_SECRET=un_secreto_largo_y_random

ADMIN_USER=admin
ADMIN_PASS=tu_password_admin
ADMIN_NOMBRE=Administrador

# Usuario común de prueba, creado por única vez si no existe (para validar
# las restricciones de rol con un segundo perfil real)
TEST_USER=operario1
TEST_USER_PASS=tu_password_operario
TEST_USER_NOMBRE=Usuario de Prueba
```

### 3. Generar contraseñas de Mosquitto

Antes de levantar Docker hay que crear el archivo de contraseñas del broker MQTT:

```bash
# Usuario del backend (lectura)
docker run --rm -v ${PWD}/mosquitto/config:/mosquitto/config eclipse-mosquitto:2 mosquitto_passwd -b -c /mosquitto/config/passwd backend TU_CONTRASEÑA_BACKEND

# Usuario del ESP32 (escritura)
docker run --rm -v ${PWD}/mosquitto/config:/mosquitto/config eclipse-mosquitto:2 mosquitto_passwd -b /mosquitto/config/passwd esp32-001 TU_CONTRASEÑA_ESP32
```

> Las contraseñas que uses acá tienen que coincidir con `MQTT_PASS` en `backend/.env` y con `SECRET_MQTT_PASS` en el sketch del ESP32.

### 4. Levantar los servicios

```bash
docker-compose up --build
```

Primera vez tarda unos minutos mientras descarga las imágenes. Cuando veas esto, todo está listo:

```
ecotrack_backend | Conectado a Mosquitto
ecotrack_backend | Suscrito a ecotrack/+/lecturas
ecotrack_backend | Base de datos lista
ecotrack_backend | Usuario admin creado: admin (rol: admin)
ecotrack_backend | Usuario de prueba creado: operario1 (rol: comun)
ecotrack_backend | Backend EcoTrack corriendo en puerto 3000
```

Los dos últimos mensajes de usuario solo aparecen la primera vez que se levanta la base (la migración es idempotente: en los siguientes arranques no vuelve a crearlos).

### 5. Acceder al sistema

| Servicio | URL |
|---|---|
| Dashboard | http://localhost:8080/login.html |
| API REST | http://localhost:3000 |
| Healthcheck | http://localhost:3000/health |

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

### Credenciales del sketch

En el archivo `esp32Secret.h`:

```cpp
#define SECRET_SSID      "nombre_de_tu_wifi"
#define SECRET_PASS      "contraseña_wifi"
#define SECRET_MQTT_HOST "IP_de_tu_PC"
#define SECRET_DEVICE_ID "ESP32-001"
#define SECRET_MQTT_USER "esp32-001"
#define SECRET_MQTT_PASS "tu_contraseña_esp32"
```

> Estas credenciales viajan hardcodeadas en `esp32Secret.h`, que está fuera del control de versiones (ver RNF06). Reprogramar el WiFi de un nodo hoy requiere reflashear el sketch — el aprovisionamiento por Bluetooth (RF15) todavía no está implementado.

El intervalo entre lecturas (RF02) es configurable vía `INTERVALO_CAPTURA_MS`, definible en `esp32Secret.h` o como build flag (`-DINTERVALO_CAPTURA_MS=5000`). Por defecto queda en 10 segundos si no se sobreescribe.

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
| DELETE | `/api/dispositivos/:codigo` | Baja lógica (deja de listarse y de recibir MQTT) | Admin |
| GET | `/api/lecturas` | Últimas lecturas (`dispositivo`, `limite`) | Autenticado |
| GET | `/api/lecturas/ultima` | Última lectura por cada dispositivo | Autenticado |
| GET | `/api/lecturas/agregado` | Series agregadas para el histórico (`dispositivo`, `periodo=dia\|semana\|mes`) | Autenticado |
| GET | `/api/umbrales` | Umbrales configurados (`dispositivo`) | Autenticado |
| POST | `/api/umbrales` | Crea o actualiza un umbral | Admin |
| GET | `/api/alertas` | Lista paginada y filtrable (`estado`, `dispositivo`, `variable`, `fechaDesde`, `fechaHasta`) | Autenticado |
| GET | `/api/alertas/distribucion` | Cantidad de alertas por variable | Autenticado |
| PATCH | `/api/alertas/:id` | Cambia el estado de una alerta, con comentario opcional | Autenticado |
| GET | `/api/usuarios` | Lista los usuarios | Admin |
| POST | `/api/usuarios` | Alta de usuario | Admin |
| PATCH | `/api/usuarios/:id` | Modifica nombre y/o rol | Admin |
| DELETE | `/api/usuarios/:id` | Elimina un usuario | Admin |
| GET | `/health` | Healthcheck del backend | Público |

### Ejemplo de request al login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
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

## Modelo de datos

```sql
dispositivos
  id, codigo (único), nombre, ubicacion, activo, creado_en, ultima_conexion

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

> `dispositivos.activo` implementa la baja lógica: un dispositivo dado de baja no se borra (para no perder su histórico de lecturas/alertas ni romper la FK), simplemente deja de listarse y sus mensajes MQTT se descartan sin guardarse.

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
├── .env.example
├── .gitignore
├── README.md
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
│       └── passwd          ← NO se versiona, generarlo manualmente
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
- [ ] Aprovisionamiento del ESP32 por Bluetooth (RF15), hoy las credenciales WiFi van hardcodeadas en `esp32Secret.h`
- [ ] API pública documentada para sistemas externos (RF19), con autenticación por API key
- [ ] TLS para MQTT (puerto 8883)
- [ ] Rate limiting en la API
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