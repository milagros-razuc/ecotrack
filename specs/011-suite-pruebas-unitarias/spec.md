# Feature Specification: Suite de pruebas unitarias trazables

**Feature Branch**: `011-suite-pruebas-unitarias`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "Suite de pruebas unitarias automatizadas del backend de
EcoTrack trazada a la matriz de requisitos RF01-RF23 y RE01-RE06."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Verificar reglas de negocio del backend (Priority: P1)

Como integrante del equipo de EcoTrack, necesito ejecutar pruebas unitarias de las reglas
de negocio del backend para detectar regresiones en validaciones, lecturas, alertas,
dispositivos, usuarios y autenticaci├│n sin depender de servicios externos.

**Why this priority**: Estas reglas protegen la integridad de las lecturas y el aislamiento
entre clientes, por lo que constituyen el n├║cleo verificable de la feature.

**Independent Test**: Ejecutar la suite desde el runner existente de `backend/src/test`
con dobles para red, persistencia, broker, reloj y hardware, y verificar los casos felices,
de borde y de error definidos para cada requisito incluido.

**Acceptance Scenarios**:

1. **Given** un caso v├ílido, l├¡mite o inv├ílido de una regla cubierta, **When** se ejecuta
   su prueba con dependencias aisladas, **Then** el resultado observado coincide con el
   comportamiento requerido y el nombre del test contiene su CP-ID.
2. **Given** dos clientes distintos con dispositivos, lecturas o alertas, **When** cada
   cliente consulta o modifica datos, **Then** cada prueba demuestra que no recibe ni
   modifica informaci├│n del otro cliente.

---

### User Story 2 - Distinguir cobertura aprobada y brechas conocidas (Priority: P1)

Como responsable de calidad, necesito un reporte que relacione cada CP-ID con su archivo,
test y estado para no confundir una prueba no ejecutada con una aprobaci├│n.

**Why this priority**: La trazabilidad permite demostrar qu├® requisitos est├ín cubiertos y
hacer visibles los defectos conocidos sin corregirlos silenciosamente.

**Independent Test**: Revisar el reporte contra la matriz de requisitos y confirmar que cada
caso est├í marcado exclusivamente como Aprobado, Fallido o Pendiente, con motivo expl├¡cito
para los pendientes.

**Acceptance Scenarios**:

1. **Given** un requisito cubierto por tests, **When** se consulta el reporte, **Then** se
   encuentra su CP-ID, archivo, nombre de test y estado real de ejecuci├│n.
2. **Given** RF02, RF07, RF14, RF15 o RF19, **When** se consulta el reporte, **Then** el
   caso aparece como Pendiente con la brecha documentada y nunca como aprobado.

---

### User Story 3 - Mantener pruebas reproducibles y seguras (Priority: P2)

Como desarrollador, necesito que las pruebas unitarias no contacten servicios reales ni
hardware, para ejecutarlas de forma determinista en cualquier entorno de desarrollo.

**Why this priority**: El aislamiento evita efectos secundarios, secretos expuestos y
resultados que dependen de Docker, PostgreSQL, MQTT o dispositivos f├¡sicos.

**Independent Test**: Ejecutar la suite sin red, Docker, broker MQTT, PostgreSQL real ni
hardware, y verificar que todas las dependencias externas sean dobles inyectados o mocks.

**Acceptance Scenarios**:

1. **Given** la suite completa, **When** se ejecuta sin servicios externos disponibles,
   **Then** las pruebas unitarias no intentan conectarse y conservan resultados
   reproducibles.
2. **Given** una prueba que revela un defecto de producci├│n, **When** se registra el
   resultado, **Then** el c├│digo de producci├│n no se altera solo para hacerla pasar y el
   caso queda pendiente con su motivo.

### Edge Cases

- Payload de lectura incompleto, malformado, con tipos incorrectos, strings, `NaN`,
  valores fuera de rango o timestamp ausente/inv├ílido.
- Umbral m├¡nimo igual o mayor al m├íximo; valor exactamente igual a un umbral; y
  notificaciones desactivadas.
- Reclamo repetido, token inv├ílido, token expirado o token cuya operaci├│n debe ser
  at├│mica; todos los rechazos deben presentar el mismo error 409 gen├®rico.
- Dispositivo nunca conectado, conectado hace exactamente dos minutos o con ├║ltima
  conexi├│n anterior.
- Token sin `clienteId`, sesi├│n revocada, intento de borrar al ├║ltimo admin y acceso
  cruzado entre dos clientes.
- Consultas de alertas vac├¡as, filtros combinados, p├íginas fuera de rango y lecturas
  hist├│ricas con `fechaDesde` o `fechaHasta`, cuyo defecto conocido debe quedar pendiente.
- Dependencias externas ausentes o reloj controlado en distintos instantes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La suite MUST cubrir RF04 con casos CP-RF04 felices, de borde y de error
  para payloads v├ílidos, malformados, incompletos, fuera de rango, con tipos incorrectos,
  `NaN` y strings.
- **FR-002**: La suite MUST cubrir RF05 y RF23 con CP-RF05 y CP-RF23, verificando la
  asociaci├│n lectura-dispositivo-cliente, la conservaci├│n de un timestamp v├ílido y la
  ca├¡da expl├¡cita a hora de recepci├│n cuando falta o es inv├ílido.
- **FR-003**: La suite MUST cubrir RF08 y RF09 con CP-RF08 y CP-RF09, incluyendo rechazo
  de m├¡nimo mayor o igual al m├íximo, valores dentro y en los l├¡mites, valores fuera de
  rango y `notificaciones_activas=false`.
- **FR-004**: La suite MUST cubrir RF11 con CP-RF11 para transici├│n pendiente-atendida,
  comentario, filtros y paginaci├│n de alertas.
- **FR-005**: La suite MUST cubrir RF12 y RF21 con CP-RF12 y CP-RF21 para alta, baja
  l├│gica, reclamo con token de un solo uso, hash SHA-256, atomicidad y el mismo error 409
  gen├®rico en todos los rechazos.
- **FR-006**: La suite MUST cubrir RF13 con CP-RF13 para estado online, offline y nunca
  conectado usando un reloj controlado y el corte de dos minutos.
- **FR-007**: La suite MUST cubrir RF16, RF17 y RF20 con CP-RF16, CP-RF17 y CP-RF20 para
  usuarios, `verificarRol`, perfil, cambio de contrase├▒a y protecci├│n contra eliminar al
  ├║ltimo admin.
- **FR-008**: La suite MUST cubrir RF18 con CP-RF18 en todos los servicios relevantes,
  probando al menos dos clientes distintos y rechazando con 401 los tokens sin clienteId
  mediante `extraerCliente`.
- **FR-009**: La suite MUST cubrir RF07 con CP-RF07 para agregaci├│n por d├¡a, semana y mes,
  y MUST mantener un test pendiente que documente que `fechaDesde` y `fechaHasta` a├║n no
  se aplican al hist├│rico.
- **FR-010**: La suite MUST incluir tests pendientes CP-RF02, CP-RF14, CP-RF19 y CP-RF15,
  cada uno con el motivo expl├¡cito de la brecha conocida: intervalo por compilaci├│n,
  ausencia de eventos de API keys, API p├║blica pendiente y portal pendiente.
- **FR-011**: Cada prueba MUST incluir su CP-ID (`CP-RFxx` o `CP-REyy`) en el nombre del
  `describe` o `it`, y el reporte MUST mapear cada CP-ID a archivo, test y estado
  Aprobado, Fallido o Pendiente.
- **FR-012**: Las pruebas unitarias MUST ejecutarse sin red, Docker, PostgreSQL real,
  broker MQTT ni hardware, reemplazando pg, mqtt y reloj con dobles o mocks inyectados.
- **FR-013**: La suite MUST usar el runner ya presente en `backend/src/test`; no se
  agregar├í otro runner para esta feature.
- **FR-014**: La feature MUST quedar limitada a l├│gica unitaria del backend; no incluir├í
  pruebas f├¡sicas, de carga, de UI en navegador ni de firmware.
- **FR-015**: El reporte MUST incluir una entrada para cada requisito RF01-RF23 y RE01-RE06,
  usando un CP-ID estable y un estado Aprobado, Fallido o Pendiente; los requisitos no
  cubiertos por esta suite MUST indicar expl├¡citamente que requieren otra modalidad de
  prueba o que est├ín fuera del alcance unitario.

### Key Entities

- **Caso de prueba (CP-ID)**: Identificador trazable a un requisito RF o RE, con archivo,
  nombre, resultado de ejecuci├│n y estado verificable.
- **Doble de dependencia**: Sustituto controlado de red, persistencia, broker, reloj o
  hardware que permite probar una regla sin efectos externos.
- **Reporte de trazabilidad**: Inventario de casos que relaciona requisitos, tests y estado
  Aprobado, Fallido o Pendiente, incluyendo motivos de las brechas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los CP-ID definidos para RF04, RF05, RF07, RF08, RF09, RF11,
  RF12, RF13, RF16, RF17, RF18, RF20, RF21 y RF23 aparece en el reporte con archivo, test
  y estado real.
- **SC-002**: El 100% de las pruebas unitarias puede ejecutarse sin red, Docker,
  PostgreSQL real, broker MQTT ni hardware conectado.
- **SC-003**: El 100% de los requisitos conocidos como brecha (RF02, RF07 en filtros de
  fechas, RF14, RF15 y RF19) figura como Pendiente con una explicaci├│n expl├¡cita y nunca
  como aprobado sin ejecuci├│n.
- **SC-004**: Cada requisito de aislamiento multi-cliente incluido tiene casos ejecutados
  con al menos dos clientes distintos y sin exposici├│n de datos entre ellos.
- **SC-005**: Una ejecuci├│n de la suite completa termina usando exclusivamente el runner
  existente y produce resultados reproducibles en dos ejecuciones consecutivas bajo las
  mismas entradas.
- **SC-006**: Un revisor puede identificar el estado y la raz├│n de cualquier CP-ID en
  menos de cinco minutos usando el reporte y los nombres de tests.

## Assumptions

- La matriz de trazabilidad usa el prefijo `CP-RFxx` para requisitos funcionales y
  `CP-REyy` para requisitos de eficiencia; los CP-ID concretos se completan durante la
  implementaci├│n y el reporte.
- El runner existente y sus convenciones en `backend/src/test` son la fuente de ejecuci├│n;
  esta feature no incorpora una herramienta alternativa.
- Los defectos indicados por el solicitante son brechas conocidas y no deben resolverse
  como parte de esta especificaci├│n.
- Las pruebas de RE01-RE06 se consideran fuera del alcance unitario cuando requieren
  carga, concurrencia o hardware; cualquier caso trazado a RE debe quedar explicitamente
  Pendiente con su motivo, sin inventar m├®tricas.
- Las pruebas de integraci├│n existentes no se convierten autom├íticamente en pruebas
  unitarias ni se cuentan como aprobadas para esta feature.
- La documentaci├│n de requisitos en `docs/requisitos.md` es la fuente de verdad para
  RF01-RF23 y RE01-RE06.
- Los requisitos RF01-RF03, RF06, RF10, RF15, RF22 y los requisitos RE01-RE06 que exijan
  rendimiento, concurrencia, hardware o firmware tendr├ín una entrada trazable en estado
  Pendiente o fuera de alcance, sin presentarse como cobertura unitaria aprobada.
