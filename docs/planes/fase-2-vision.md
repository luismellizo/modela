# Fase 2 — Visión: de la imagen a la arquitectura

**Objetivo:** el usuario arrastra el plano de su casa al chat, dice "recréalo en 3D", y el
modelo aparece en el editor — sin que la IA se invente cotas que no vio.

---

## El problema real

Una imagen **no** contiene información perfecta. Un plano escaneado tiene cotas ilegibles;
una foto de fachada no tiene ninguna. Si el modelo rellena huecos en silencio, produce una
casa que no es la del usuario y nadie se entera.

Por eso toda extracción visual se clasifica en tres cubos:

```json
{
  "observed":  ["cota 5.20 m en el salón", "4 habitaciones etiquetadas"],
  "inferred":  ["altura de muro 2.60 m (estándar residencial)"],
  "unknown":   ["espesor de muros", "orientación norte", "altura de ventanas"]
}
```

- `observed` se usa tal cual.
- `inferred` se usa, pero se marca en la UI y se puede corregir.
- `unknown` **se pregunta** o se deja con el valor por defecto del editor, avisando.

---

## Flujo

```
usuario adjunta imagen
   ↓
validación (tipo, tamaño, dimensiones)   ← servidor, no confiar en el cliente
   ↓
clasificación: ¿plano, fachada, interior, croquis, terreno, referencia?
   ↓
análisis con LLM multimodal
   ↓
extracción estructurada → observed / inferred / unknown
   ↓
plan de construcción (propuesta, no ejecución)
   ↓
el usuario revisa y aplica
   ↓
materialización en el Scene Graph
```

---

## Entregables

| Pieza | Ruta | Qué hace |
|---|---|---|
| Adjuntos | `apps/editor/components/copilot/attachments.tsx` | Arrastrar, pegar, previsualizar, quitar |
| Validación | `packages/ai/src/vision/validate.ts` | MIME real, tamaño máximo, límite de píxeles |
| Esquema | `packages/ai/src/vision/schema.ts` | Zod del análisis arquitectónico estructurado |
| Analizador | `packages/ai/src/vision/analyze.ts` | Imagen → estructura, vía `AIProvider.analyzeImage` |
| Clasificador | `packages/ai/src/vision/classify.ts` | Tipo de imagen → prompt especializado |
| Materializador | `packages/ai/src/vision/materialize.ts` | Estructura → patches del Scene Graph |
| Captura del viewport | `apps/editor/components/copilot/viewport-capture.ts` | Render actual como imagen para el modelo |

---

## Esquema de extracción

```ts
{
  project: { type: 'residential' | 'commercial' | ..., units: 'metric' | 'imperial' },
  confidence: 'high' | 'medium' | 'low',
  scale: { known: boolean, metersPerPixel?: number, source?: string },
  spaces: [{ name, type, estimatedDimensions: { width, depth }, source }],
  walls:   [{ start, end, thickness?, source }],
  doors:   [{ wallRef, position, width?, source }],
  windows: [{ wallRef, position, width?, height?, source }],
  stairs:  [...],
  observed: string[], inferred: string[], unknown: string[]
}
```

`source` en cada entidad dice si vino de `observed` o de `inferred`. Se propaga hasta la UI.

---

## Orden de trabajo

1. Validación de imágenes en servidor, con tests de archivos maliciosos y sobredimensionados.
2. Esquema Zod del análisis arquitectónico.
3. `AIProvider.analyzeImage` en el adaptador OpenRouter y en el mock.
4. Clasificador de tipo de imagen con prompt por tipo.
5. Analizador de planos → estructura con `observed`/`inferred`/`unknown`.
6. Materializador estructura → patches, reutilizando los tools de escena de la fase 1.
7. Adjuntos en el composer: arrastrar, pegar del portapapeles, miniatura, quitar.
8. Propuesta previa a aplicar, con lo inferido y lo desconocido bien visible.
9. Captura del viewport como contexto visual ("¿qué mejorarías de esta distribución?").
10. Tests: validación, extracción, materialización, degradación con imagen ilegible.
11. Actualizar `CLAUDE.md`.

---

## Criterios de aceptación

- [ ] Un plano fotografiado produce muros, habitaciones y vanos reconocibles.
- [ ] Las cotas no visibles aparecen como `inferred` o `unknown`, nunca como observadas.
- [ ] Una imagen que no es arquitectura se rechaza con un mensaje útil.
- [ ] Un archivo de 40 MB o un PDF renombrado a `.png` se rechazan en el servidor.
- [ ] "¿Qué mejorarías de esta distribución?" con la escena actual devuelve crítica concreta
      referida a habitaciones que existen de verdad.
- [ ] La propuesta se puede cancelar sin tocar la escena.

---

## Fuera de alcance

- OCR dedicado de cotas. Se usa lo que el modelo multimodal lee. Si hace falta más precisión,
  entra en fase 4 como módulo aparte.
- Vectorización automática de planos (raster → polilíneas). Otro problema, otra fase.
