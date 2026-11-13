# Feature Specification: Selección de redes WiFi en el portal ESP32

**Feature Branch**: `023-selector-redes-wifi`

**Created**: 2026-11-13

**Status**: Implemented; acceptance reported by user, device/browser details pending

**Input**: El usuario informa que las redes WiFi no aparecen en el selector del sitio que despliega el ESP32.

## Relación con specs anteriores

La Feature 010 define el portal temporal y recuperable, pero su comportamiento de seguridad fue reemplazado por la Feature 019. La Feature 019 mantiene la configuración WiFi en el portal, aunque no define cómo se buscan y presentan las redes cercanas. Esta spec agrega ese comportamiento de interfaz y la respuesta de escaneo sin cambiar el contrato de seguridad ni el ciclo de vida del SoftAP de 019.

## User Scenarios & Testing

### User Story 1 - Buscar y seleccionar una red disponible (Priority: P1)

Como instalador, quiero buscar y elegir una red WiFi detectada por el ESP32 desde una lista visible, para configurar el dispositivo sin tener que escribir manualmente el SSID.

**Why this priority**: La selección actual se basa en un `datalist` nativo, cuyo desplegado depende del navegador y de la interacción de entrada; el usuario reporta que las redes no aparecen en el selector.

**Independent Test**: En un ESP32 con el portal activo, buscar redes, comprobar que las detectadas aparecen en un control de selección visible, elegir una y verificar que su SSID queda en el campo enviado al guardar.

**Acceptance Scenarios**:

1. **Given** que el portal está abierto y el ESP32 detecta una o más redes con SSID visible, **When** se completa la búsqueda automática inicial o el instalador pulsa “Buscar redes cercanas”, **Then** los nombres se muestran en una lista desplegable explícita y seleccionable.
2. **Given** que hay resultados, **When** el instalador selecciona una red, **Then** el SSID seleccionado se refleja en el campo que se envía a `/save`.
3. **Given** que el instalador conoce una red oculta o no listada, **When** escribe su SSID manualmente, **Then** puede continuar con el flujo vigente de configuración.
4. **Given** que la búsqueda está en curso, **When** el instalador observa el portal, **Then** ve un estado de carga y no inicia búsquedas concurrentes desde el mismo control.
5. **Given** que la búsqueda termina sin resultados, **When** el portal presenta el resultado, **Then** informa que no encontró redes y mantiene disponible la entrada manual.
6. **Given** que el endpoint de búsqueda falla o el dispositivo informa que no puede escanear en ese momento, **When** termina la solicitud, **Then** el portal muestra un error distinguible de una búsqueda válida sin resultados y mantiene la entrada manual.

### User Story 2 - Conservar el aprovisionamiento existente (Priority: P1)

Como instalador, quiero que seleccionar o escribir el SSID no cambie las reglas vigentes de configuración, para que el dispositivo solo guarde y pruebe los datos cuando confirme el formulario.

**Independent Test**: Seleccionar y escribir SSID, verificar que ninguna acción inicia conexión ni altera la configuración persistida hasta enviar el formulario; confirmar que el contrato del portal WPA2, el guardado y los estados de conexión se mantienen.

**Acceptance Scenarios**:

1. **Given** una red seleccionada, **When** el instalador todavía no envió el formulario, **Then** el ESP32 no intenta conectarse ni guarda cambios.
2. **Given** un SSID seleccionado o escrito manualmente, **When** se envía el formulario, **Then** se conserva el flujo de validación, conexión, guardado y cierre descrito en la Feature 019.
3. **Given** el portal activo, **When** se actualiza la búsqueda, **Then** se conservan el SSID ya ingresado/seleccionado y la contraseña WiFi escrita.

## Requirements

### Functional Requirements

- **FR-001**: El portal MUST presentar las redes detectadas en un control explícito de selección; la disponibilidad de opciones MUST NOT depender de que el navegador abra sugerencias de un `datalist`.
- **FR-002**: El instalador MUST poder escribir manualmente un SSID que no figure en la lista, incluidas redes ocultas.
- **FR-003**: La búsqueda MUST indicar carga, resultados vacíos y error de escaneo/solicitud como estados distintos.
- **FR-004**: Una búsqueda repetida MUST reemplazar la lista anterior con el resultado más reciente y MUST evitar solicitudes concurrentes desde el portal.
- **FR-005**: Seleccionar una red MUST completar el SSID usado por el formulario vigente y MUST NOT iniciar conexión ni persistir la configuración por sí sola.
- **FR-006**: La respuesta del endpoint local de redes MUST distinguir una búsqueda completada sin resultados de un error de escaneo o de una búsqueda no disponible por estado del portal.
- **FR-007**: El cambio MUST conservar WPA2 SoftAP, el código compartido, la duración/recuperación del portal, el endpoint de guardado y la confirmación de conectividad definidos en la Feature 019.
- **FR-008**: La lista MUST seguir deduplicando SSID repetidos y no MUST exponer datos de red distintos de los necesarios para identificarla y seleccionarla.

## Fuera de alcance

- Cambiar el nombre, clave, modo o tiempo de vida del SoftAP.
- Cambiar el proceso de guardado, conexión WiFi, MQTT/TLS, enrolamiento o persistencia de credenciales.
- Enumerar contraseñas, conectarse automáticamente a una red o almacenar resultados del escaneo.
- Añadir compatibilidad con bandas o hardware fuera de las capacidades ya soportadas por el ESP32 del proyecto.
- Reemplazar la escritura manual de SSID o bloquear redes ocultas.

## Assumptions

- El control de selección explícito es la solución de interfaz prevista para evitar depender del soporte variable de `datalist`.
- La búsqueda debe ejecutarse con el modo SoftAP/estación que ya usa el firmware.
- La lista reporta SSID únicos; no se agrega selección por BSSID ni indicador de intensidad en esta feature.
- El contrato de escaneo local puede evolucionar coordinadamente porque el portal embebido es su consumidor conocido; cualquier cambio debe quedar documentado en el contrato de esta spec.

## Requirements Traceability

Refina **RF15**, **RI13** y **RD06** de `docs/requisitos.md`. Complementa, sin reemplazar, el contrato de portal aprobado en `specs/019-portal-softap-wpa2/`.
