# Feature Specification: Automatizar fabricación de dispositivos

**Feature Branch**: `015-automatizar-fabricacion-dispositivos`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Reducir los pasos manuales del operador mediante un script único de fabricación, flasheo por línea de comandos y comprobación opcional del enrolamiento, sin modificar enrolamiento, reclamo ni Dynamic Security. En Windows, usar el esptool real de Arduino IDE, detectar puertos con Get-CimInstance Win32_SerialPort y exigir --port si hay más de uno; los tests no deben imprimir ni guardar tokens reales."

## User Scenarios & Testing

### User Story 1 - Fabricar un lote de dispositivos (Priority: P1)

Como operador, quiero ejecutar un único comando indicando cantidad, host y carpeta de
salida para generar las identidades, registrar los dispositivos en el backend y obtener
los artefactos necesarios sin manipular secretos en la consola.

**Why this priority**: Reduce los cinco pasos manuales actuales y evita importaciones
incompletas o inconsistentes.

**Independent Test**: Con una base `ecotrack_test`, un contenedor `ecotrack_backend` y
una carpeta de salida fuera del repositorio, ejecutar el script para un dispositivo y
verificar que el importador informa exactamente un insertado, que existe el registro de
fábrica, que se generó un token local protegido y que ningún secreto aparece en stdout,
stderr o logs.

**Acceptance Scenarios**:

1. **Given** una cantidad válida, un host válido y una carpeta externa vacía, **When** el
   operador ejecuta el script, **Then** se ejecuta la generación con NVS `0x5000` y
   `--export-backend`, se importa `backend.csv`, se borra la copia temporal y se crea un
   token por cada `device_id`.
2. **Given** que el importador informa menos insertados que los dispositivos esperados,
   **When** termina la importación, **Then** el script aborta antes de generar tokens o
   flashear dispositivos y deja un error explícito sin secretos.
3. **Given** una carpeta dentro del repositorio o una carpeta de salida no vacía,
   **When** el operador inicia el script, **Then** se rechaza la operación antes de
   generar identidades o copiar archivos.

### User Story 2 - Flashear firmware y NVS en orden seguro (Priority: P1)

Como operador, quiero que el mismo flujo detecte o reciba el puerto serie y escriba
primero el firmware y después el NVS en `0x9000`, para no perder la identidad de fábrica.

**Why this priority**: El orden incorrecto o el borrado total de flash invalida el
dispositivo fabricado.

**Independent Test**: Con un dispositivo conectado y un firmware/binary válido, ejecutar
el modo de flasheo y verificar en la evidencia del comando que la operación de firmware
precede a la escritura NVS, con tamaño `0x5000`.

**Acceptance Scenarios**:

1. **Given** un puerto detectado o indicado explícitamente, **When** se ejecuta el flujo,
   **Then** se carga el firmware primero y el NVS después en `0x9000`.
2. **Given** que no existe herramienta CLI, firmware, imagen NVS o puerto válido,
   **When** se inicia el flasheo, **Then** se aborta antes de escribir y se indica la
   alternativa o el parámetro faltante.
3. **Given** un fallo al cargar el firmware, **When** continúa el comando, **Then** no
   se escribe el NVS.

### User Story 3 - Identificar cada dispositivo y comprobar enrolamiento (Priority: P2)

Como operador, quiero conservar una etiqueta mínima por dispositivo y poder solicitar
una comprobación posterior que confirme el estado de enrolamiento sin mostrar secretos.

**Why this priority**: Permite asociar físicamente cada unidad con su identidad y
detectar fallos sin consultar tokens ni credenciales.

**Independent Test**: Verificar que cada etiqueta contiene solo `device_id` y PIN, y que
el modo opcional consulta el estado de un dispositivo con resultado enrolado/no enrolado
sin imprimir secretos.

**Acceptance Scenarios**:

1. **Given** un lote generado correctamente, **When** finaliza la fabricación, **Then**
   existe una etiqueta por dispositivo con `device_id` y PIN, fuera del repositorio.
2. **Given** el modo de comprobación habilitado, **When** el dispositivo completa el
   enrolamiento, **Then** el script informa únicamente el estado y termina exitosamente.
3. **Given** que el dispositivo no aparece enrolado antes del límite de espera, **When**
   vence el tiempo configurado, **Then** el script informa estado pendiente/fallido sin
   revelar secretos y termina con código no exitoso.

### Edge Cases

- La cantidad debe ser un entero positivo y los parámetros requeridos no pueden estar
  vacíos.
- La carpeta de salida debe estar fuera del repositorio y no puede contener archivos
  preexistentes.
- El importador puede insertar cero o menos registros de los esperados; nunca se deben
  generar tokens para un lote parcialmente importado.
- Un token o secreto accidentalmente producido por una herramienta externa no debe ser
  repetido por el script en mensajes, excepciones o archivos dentro del repositorio.
- Si existen varios puertos seriales, el operador debe poder seleccionar uno de forma
  determinista; no se debe flashear un puerto ambiguo automáticamente.
- Un dispositivo puede quedar reclamado pero todavía no enrolado; la comprobación debe
  distinguir ese estado de un error de transporte.

## Requirements

### Functional Requirements

- **FR-001**: El sistema MUST ofrecer un único comando de fabricación con parámetros para
  cantidad, host, carpeta de salida, archivo de firmware (`--firmware`) y archivo de
  particiones (`--partitions`).
- **FR-002**: El comando MUST rechazar carpetas dentro del repositorio y carpetas de
  salida no vacías antes de generar o copiar secretos.
- **FR-003**: El comando MUST ejecutar `scripts\provision_factory.py` con `--nvs-size
  0x5000` y `--export-backend`.
- **FR-004**: El comando MUST copiar `backend.csv` al contenedor real `ecotrack_backend`,
  ejecutar el importador con una sola ruta `/tmp/backend.csv` y borrar esa copia después
  de una importación terminada.
- **FR-005**: El comando MUST abortar si la cantidad de dispositivos insertados no
  coincide con la cantidad solicitada, sin generar tokens ni iniciar flasheos.
- **FR-006**: El comando MUST ejecutar `scripts/provision-device.js` una vez por cada
  `device_id` importado y MUST guardar cada token en un archivo local protegido fuera del
  repositorio.
- **FR-007**: Tokens, secretos de fábrica, `device_secret`, contraseñas y credenciales
  MQTT MUST NOT aparecer en stdout, stderr, logs ni archivos del repositorio.
- **FR-008**: El comando MUST generar una etiqueta por dispositivo que contenga solamente
  su `device_id` y PIN de instalación.
- **FR-009**: El comando MUST escribir el firmware en este orden y direcciones:
  particiones en `0x8000`, aplicación en `0x10000` y NVS al final en `0x9000` con tamaño
  `0x5000`; si falla cualquiera de las primeras escrituras, MUST NOT escribir el NVS.
- **FR-010**: El paso de firmware MUST NOT ejecutar `erase_flash` ni ninguna operación
  equivalente de borrado total antes de escribir las particiones o la aplicación.
- **FR-011**: En Windows, el comando MUST detectar los puertos seriales mediante
  `Get-CimInstance Win32_SerialPort`; cuando haya exactamente uno puede usarlo
  automáticamente y cuando haya más de uno MUST exigir `--port`.
- **FR-012**: El comando MUST usar el ejecutable real de Arduino IDE ubicado bajo
  `%LOCALAPPDATA%\Arduino15\packages\esp32\tools\esptool_py\<versión>\esptool.exe`,
  con sintaxis `write-flash`, o aceptar una ruta explícita equivalente; MUST NOT usar
  `python -m esptool`, desactivar la validación TLS ni usar `setInsecure()`.
- **FR-013**: El modo opcional de comprobación MUST consultar únicamente
  `dispositivos_fabrica.enrolled_at` mediante una consulta SQL de solo lectura ejecutada
  con `docker compose exec` contra el contenedor `ecotrack_backend`; MUST NOT modificar
  el backend ni mostrar secretos.
- **FR-014**: El archivo local de tokens MUST tener ACL restringida al usuario actual de
  Windows mediante `icacls`, sin permisos heredados para otros usuarios, y el comando
  MUST verificar que esa restricción se aplicó.
- **FR-015**: Los tests MUST usar tokens y secretos sintéticos, y MUST NOT imprimirlos,
  persistirlos en archivos de salida ni guardarlos en logs o artefactos versionados.
- **FR-016**: La automatización MUST reutilizar los contratos existentes de fabricación,
  importación, enrolamiento y Dynamic Security sin modificar su comportamiento.
- **FR-017**: Los tests de integración MUST ejecutarse desde el host con Node.js >= 20,
  `TEST_DATABASE_URL` apuntando a una base `ecotrack_test` y sin tocar los tests existentes
  de enrolamiento.
- **FR-018**: La documentación MUST indicar los nombres reales de comandos, servicio y
  contenedor, el orden firmware/NVS y el manejo de tokens fuera del repositorio.
- **FR-019**: La validación hardware MUST ejecutar `flash_id` y decodificar la tabla de
  particiones, verificando que el NVS está en `0x9000` y tiene tamaño `0x5000`, sin
  borrar la flash completa.
- **FR-020**: El comando MUST ofrecer un modo opcional de espera y comprobación del estado
  de enrolamiento sin mostrar secretos.
- **FR-021**: El modo de comprobación MUST distinguir al menos enrolado, pendiente y error,
  y MUST finalizar con código adecuado al resultado.

### Key Entities

- **Lote de fabricación**: conjunto de identidades y artefactos generados para una
  cantidad solicitada.
- **Artefacto de dispositivo**: imagen NVS, etiqueta y metadatos de un `device_id`.
- **Registro de token local**: archivo externo al repositorio con tokens de reclamo
  protegidos, nunca mostrado por el comando.
- **Estado de comprobación**: resultado no secreto del dispositivo: enrolado, pendiente
  o error.

## Success Criteria

### Measurable Outcomes

- **SC-001**: El operador completa la fabricación de un dispositivo con un comando y sin
  ejecutar manualmente más de una acción de confirmación física.
- **SC-002**: En un lote válido, el 100% de los `device_id` solicitados queda importado
  antes de generar cualquier token o iniciar flasheo.
- **SC-003**: En pruebas automatizadas, 0 secretos aparecen en stdout, stderr, logs o
  archivos del repositorio.
- **SC-004**: En el 100% de las ejecuciones exitosas, el firmware se escribe antes que
  el NVS y el NVS usa dirección `0x9000` y tamaño `0x5000`.
- **SC-005**: El modo opcional de comprobación informa el estado final sin credenciales
  en menos de un tiempo configurable por el operador.

## Assumptions

- El contenedor backend se llama `ecotrack_backend` y los scripts existentes conservan
  sus contratos actuales.
- La carpeta de salida y el archivo de tokens se crean en una ruta externa al
  repositorio; el operador controla sus permisos del sistema operativo.
- El ejecutable operativo de `esptool` es el que instala Arduino IDE bajo
  `%LOCALAPPDATA%\Arduino15\packages\esp32\tools\esptool_py\<versión>\esptool.exe`;
  la versión verificada es 5.3.0 y su sintaxis es `write-flash`. No se usará
  `python -m esptool`.
- El reclamo administrativo sigue siendo deliberado y manual; el reclamo automático o
  por lote está fuera de esta feature.
- El estado de enrolamiento vive en `dispositivos_fabrica.enrolled_at`, no en
  `dispositivos`.

## Out of Scope

- Reclamo automático o reclamo por lote.
- Cambios al endpoint de enrolamiento, reclamo o Dynamic Security.
- Reset de credenciales, especificado por separado en
  [`016-reset-credenciales-dispositivo`](../016-reset-credenciales-dispositivo/spec.md).
