# Quickstart de validación documental

Esta guía verifica la reconciliación de requisitos sin ejecutar ni modificar el producto.

## Fuentes

- Tesis vigente: `/Users/ramacabrera/Documents/0-udemm/2026/proyecto-final/PROYECTO FINAL DE SISTEMAS-ECOTRACK.md`, sección 2.3.1–2.3.5.
- Catálogo versionado: `docs/requisitos.md`.
- Matriz auxiliar: `/Users/ramacabrera/Downloads/matriz_trazabilidad_ecotrack.md` (consulta solamente).
- Crosswalk: `specs/012-alinear-requisitos-tesis/crosswalk.md`.

## Revisión por ID

1. Confirmar que cada fila RF, RI, RE, RD y RNF del catálogo tiene un único ID.
2. Comparar cada descripción y sus unidades, volúmenes, umbrales, tiempos y condiciones con la sección correspondiente de la tesis.
3. Clasificar cada diferencia como equivalente, ausente, ampliación, contradicción o ID reasignado; aplicar la disposición aprobada en `research.md`.
4. Revisar referencias a IDs en `README.MD` y `specs/001-*`–`specs/010-*`; actualizar solo afirmaciones que contradigan el catálogo nuevo y conservar el contexto histórico de cada feature.
5. Comparar la matriz como evidencia/estado: no copiar sus estados a los requisitos; corregir en el crosswalk los estados fechados y el texto OCR señalado.

## Comprobación de presencia y duplicados

Desde la raíz del repositorio, extraer las filas del catálogo con:

```sh
rg -o '^\| *(RF|RI|RE|RD|RNF)[0-9]{2} *\|' docs/requisitos.md
```

Revisar que haya 86 filas, que cada ID aparezca una vez y que los rangos sean RF01–RF23, RI01–RI25, RE01–RE06, RD01–RD10 y RNF01–RNF22. Después comparar el diff con el crosswalk y revisar los cambios con el dueño del baseline.

## Evidencia de cierre

- Diff por ID cotejado con la tesis.
- Lista de diferencias resueltas y candidatos que requieren decisión.
- Conteo y unicidad de los 86 IDs.
- Revisión de referencias afectadas en README y specs.
- `git diff --check` sin errores.

Esta guía no declara implementación ni aceptación de producto; las pruebas unitarias, de integración, hardware y carga pertenecen a sus respectivos paquetes.
