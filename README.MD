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

Editá `.env` con las credenciales de Postgres y `backend/.env` con todos los parámetros de conexión.

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
ecotrack_backend | Backend EcoTrack corriendo en puerto 3000
```

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

### Librerías necesarias (Arduino IDE)

- `DHT sensor library` — Adafruit
- `Adafruit Unified Sensor` — Adafruit
- `PubSubClient` — Nick O'Leary

---

## Endpoints de la API

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Autenticación, devuelve token |
| GET | `/api/auth/me` | Verificar sesión activa |
| GET | `/api/dispositivos` | Lista todos los dispositivos |
| GET | `/api/dispositivos/estado` | Lista con estado online/offline |
| POST | `/api/dispositivos` | Crear o actualizar dispositivo |
| GET | `/api/lecturas` | Últimas lecturas (parámetros: `dispositivo`, `limite`) |
| GET | `/api/lecturas/ultima` | Última lectura por cada dispositivo |
| GET | `/health` | Healthcheck del backend |

### Ejemplo de request al login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"tu_pass"}'
```

### Ejemplo de payload del ESP32

```json
{
  "temperatura": 23.4,
  "humedad": 47.0,
  "luminosidad": 65
}
```

Topic MQTT: `ecotrack/ESP32-001/lecturas`

---

## Modelo de datos

```sql
dispositivos
  id, codigo (único), nombre, ubicacion, activo, creado_en, ultima_conexion

lecturas
  id, dispositivo_codigo (FK), temperatura, humedad, luminosidad, timestamp

alertas
  id, dispositivo_codigo, variable, valor, umbral_min, umbral_max, timestamp
```

---

## Usuarios por defecto

Los usuarios se configuran en `backend/src/routes/auth.js`. Por defecto:

| Usuario | Contraseña |
|---|---|
| admin | definida en `ADMIN_PASS` del .env |
| ramiro | definida en el código |
| milagros | definida en el código |

> Para producción se recomienda migrar a JWT real con bcrypt y tabla de usuarios en la base de datos.

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
│       ├── config/
│       ├── middleware/
│       ├── mqtt/
│       ├── routes/
│       └── services/
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
    └── ecotrack-logo.png
```

---

## Trabajo futuro

- [ ] JWT real con `jsonwebtoken` + contraseñas con `bcrypt`
- [ ] Sistema de alertas por umbral (tabla creada, lógica pendiente)
- [ ] Conectar páginas de histórico, configuración y auditoría al backend real
- [ ] TLS para MQTT (puerto 8883)
- [ ] Rate limiting en la API
- [ ] Recuperación de contraseña por email
- [ ] Sensores mejorados: DHT22 + BH1750
- [ ] Integración con LLM para análisis de tendencias ambientales
- [ ] Soporte multi-dispositivo probado en producción

---

## Tecnologías utilizadas

| Capa | Tecnología |
|---|---|
| Hardware | NodeMCU ESP32S, DHT11, LDR |
| Comunicación | MQTT (Eclipse Mosquitto) |
| Backend | Node.js, Express, pg |
| Base de datos | PostgreSQL 15 |
| Frontend | HTML, Tailwind CSS, Chart.js |
| Infraestructura | Docker, Docker Compose, nginx |
