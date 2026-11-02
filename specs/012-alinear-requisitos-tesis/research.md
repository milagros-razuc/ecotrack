# Research: Alinear requisitos con la tesis vigente

**Fecha**: 2026-11-02  
**Spec**: [spec.md](spec.md)

## Fuentes y jerarquía

### Decisión: tomar la tesis modificada el 2026-10-31 como fuente normativa

- **Fuentes**: `/Users/ramacabrera/Documents/0-udemm/2026/proyecto-final/PROYECTO FINAL DE SISTEMAS-ECOTRACK.md`, sección 2.3 (tablas RF, RI, RE, RD y RNF); `docs/requisitos.md`; matriz de trabajo `/Users/ramacabrera/Downloads/matriz_trazabilidad_ecotrack.md` (29/10).
- **Resolución**: la tesis proporciona el criterio normativo. `docs/requisitos.md` permanece como catálogo versionado que consumen las specs; se actualizará para reflejar la tesis. La matriz externa se trata como derivada de pruebas/estado, no como autoridad normativa.
- **Razón**: así se respeta el acuerdo del usuario y se mantiene el punto único versionado que la constitución actual exige para citar IDs.
- **Alternativa descartada**: mantener `docs/requisitos.md` como autoridad aunque contradiga la tesis; contradice la instrucción previa del usuario. Promediar criterios también se descarta porque produciría criterios nuevos sin aprobación.

### Decisión: conservar extras con disposición explícita

- **Resolución**: un criterio presente en `docs/requisitos.md` pero ausente o distinto en la tesis no se borra ni se reasigna a otro ID. Se registra en el crosswalk de reconciliación como candidato fuera del baseline y queda pendiente de una decisión explícita sobre incorporarlo a la tesis o retirarlo del catálogo normativo.
- **Ejemplos**: buffer de 360 lecturas, validación de timestamp por antigüedad/rango, atomicidad/auditoría de operaciones de dispositivo y algunos detalles adicionales de API/TLS. Algunos ya tienen cobertura en otros IDs de la tesis; no se duplican bajo IDs cuyo significado cambió.

## Diferencias observadas por grupo

| Grupo | Hallazgo de alto impacto | Acción de diseño |
|---|---|---|
| RF | RF07 de tesis incluye todos/algunos dispositivos, fecha y agregación; RF10 limita pop-up a uso activo; RF12 incluye modificación, baja, reclamo y aprovisionamiento previo; RF21 describe reclamar equipo sin dueño; RF22 incluye equivalencia de una hora al intervalo predeterminado; RF23 define fallback a hora de recepción cuando falta `ts`. El repo omite, añade o mezcla parte de esos criterios. | Copiar el sentido de la tesis y mantener token/seguridad, atraso u otros detalles en los IDs correspondientes cuando existan. |
| RI | RI03 de tesis contiene rango y filtro por dispositivo; RI13 no expresa el detalle de cierre que agrega el repo; RI21 requiere ACL por dispositivo; RI24 es solo backend-broker; RI25 corresponde a hash de API keys, no al buffer. | Alinear filas y registrar precisión adicional por separado, sin duplicar RF22 ni mover semántica entre IDs. |
| RE | Los seis RE difieren materialmente. RE01 en tesis: 50 dispositivos, una lectura/10 s, ≤500 ms p95 desde broker. RE03: 50 dispositivos/5 clientes y comparación con base de 5, sin pérdida. RE04: rango de 30 días/un dispositivo/≤2 s. RE05: RAM ≤60%, ciclo dentro del intervalo, 24 h sin reset por memoria. RE06: 10× clientes y lecturas, degradación ≤25%. | No promediar. Usar valores de la tesis y conservar en matriz únicamente estado y resultados observados. |
| RD | RD06 repo añade temporalidad; RD08 fija precisión DHT11 que la tesis deja por modelo; RD09 agrega Bluetooth que la tesis no incluye. | Alinear el criterio normativo con la tesis; conservar detalles confirmados de implementación fuera de la fila normativa. |
| RNF | RNF01–02 tienen diferencias de alcance. En RNF13–21 hay desplazamiento semántico significativo: reconexión, usabilidad, ACL, reclamo, aislamiento tras transferencia, revocación de sesión, eventos tenant y límites de tasa aparecen con IDs diferentes entre las fuentes. RNF22 (>5 min: persistir sin alertas/eventos) coincide sustancialmente. | Alinear todas las filas con la numeración/texto de tesis. Volver a mapear pruebas y specs por significado, nunca por el número anterior sin verificar. |

## Referencias cruzadas y material externo

- `docs/requisitos.md` se declara hoy “fuente de verdad para Spec Kit”; alinear sus filas con tesis permite conservar esa función sin cambiar los principios de `.specify/memory/constitution.md`.
- La matriz externa cubre RF01–RF23 y RE01–RE06, no RI/RD/RNF; algunos estados son hallazgos fechados u OCR dañado. Se usa para detectar escenarios y errores, no para reescribir requisitos.
- `README.MD` y specs 001–010 contienen referencias a IDs y estados. Después de fijar el catálogo, se debe revisar cuáles quedaron obsoletos. Las specs terminadas se conservan como historial; solo se modifican referencias cuando el cambio es necesario y se deja vínculo a la reconciliación.
- No se cambia tesis ni se escribe la matriz externa en esta fase. El catálogo versionado y el crosswalk del repo dejan evidencia del diff; una actualización de la matriz externa se planifica con su propio acceso y revisión.

## Límites de esta feature

No cambia comportamiento del producto, base de datos, API, firmware ni criterios de aceptación físicos. No convierte estado de implementación en texto normativo. Las evidencias físicas, integración y rendimiento se ejecutan en sus paquetes del roadmap.
