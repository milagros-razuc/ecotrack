# Modelo de reconciliación documental

Esta feature no cambia el modelo de datos del producto. Usa un registro editorial temporal para describir diferencias entre fuentes y verificar cada requisito.

## Entrada de reconciliación

| Campo | Descripción |
|---|---|
| `id` | Identificador normativo estable: RF, RI, RE, RD o RNF. |
| `dominio` | Tipo de requisito y sección de la tesis. |
| `revision_tesis` | Fecha/versión de la tesis comparada. |
| `texto_normativo` | Texto y criterio de aceptación de la tesis acordada. |
| `texto_catalogo_actual` | Contenido previo de `docs/requisitos.md`. |
| `diferencia` | Ausente, equivalente, ampliación, contradicción, reasignación de ID o estado confundido con requisito. |
| `disposicion` | Alinear, mantener como precisión derivada, registrar como candidato o pedir decisión. |
| `justificacion` | Fuente/decisión que respalda la disposición. |
| `referencias_afectadas` | Matriz, README, specs, pruebas u otros documentos que citan el ID. |
| `validacion` | Resultado de revisión y evidencia del catálogo reconciliado. |

## Ciclo de la entrada

`detectada → clasificada → resuelta o registrada para decisión → aplicada → verificada`

Un ID no pasa a `aplicada` si cambió su significado por deducción o si una diferencia requiere aprobación. La matriz de Downloads puede aportar contexto de prueba, pero no reemplaza `texto_normativo`.
