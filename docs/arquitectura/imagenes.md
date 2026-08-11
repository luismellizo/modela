# Imágenes

## Dos caminos distintos

| Camino | Cuándo | Cómo |
|---|---|---|
| **Mirar** | "¿qué es esto?", "¿te gusta esta fachada?" | La imagen viaja en el mensaje del usuario. El modelo la ve directamente. |
| **Extraer** | "recrea este plano en 3D" | Herramienta `analyze_image` → estructura → plan → herramientas de escena |

El primero es gratis y directo. El segundo existe porque construir a partir de una imagen
exige algo que el modelo no hace solo si no se lo obligas: separar lo que vio de lo que
supuso.

## `observed` / `inferred` / `unknown`

Un modelo al que le pides las medidas de un plano te devuelve un dormitorio de 4,2 m
aunque en la imagen no haya ni una cota. No miente a propósito: rellena.

El schema lo impide estructuralmente:

```ts
{
  observed: ['5.20 m dimension line on the living room', '4 rooms labelled'],
  inferred: ['2.60 m ceiling height, typical residential'],
  unknown:  ['Wall thickness', 'North orientation', 'Window heights'],
}
```

Y cada entidad lleva su propia procedencia:

```ts
{ name: 'Living', widthM: 5.2, depthM: 4.1, source: 'observed' }
{ name: 'Bedroom', widthM: null, depthM: null, source: 'inferred' }
```

`planFromExtraction` la propaga hasta el plan (`assumed: true`), y el prompt le exige al
modelo que se lo diga al usuario. Una medida estimada nunca se presenta como medida.

Cuando no hay escala:

```
"The image has no scale reference. Dimensions below are proportional
 estimates — check them before building."
```

## El flujo completo

```
usuario adjunta
      ↓
composer: validación en cliente        ← cortesía, no control
      ↓
POST /api/copilot
      ↓
route: validación en servidor          ← el control de verdad
      ↓
el modelo ve la imagen en el mensaje
      ↓
¿va a construir?  ──no──► responde mirándola
      │
      sí
      ↓
analyze_image  →  clasificar tipo
               →  prompt especializado por tipo
               →  extracción estructurada (JSON Schema)
               →  plan de construcción
      ↓
el modelo ejecuta el plan con create_room / add_door / add_window
      ↓
Scene Graph
```

## Validación

`packages/ai/src/vision/validate.ts`. Lo importante: **el MIME declarado en un data URL lo
escribe quien envía**. Un PDF renombrado a `.png` se anuncia como PNG. Lo único honesto son
los bytes de cabecera:

```ts
const SIGNATURES = [
  { mime: 'image/png',  bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif',  bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },  // + "WEBP" en 8..11
]
```

Se rechaza: tipo no permitido, cabecera que no coincide con lo declarado, base64 roto,
vacío, y más de 8 MB. Todo cubierto en `vision.test.ts`.

El composer valida también, pero solo para dar respuesta rápida. La ruta de API revalida
porque lo que le llega puede no venir de nuestra UI.

## Tipos de imagen soportados

`packages/ai/src/vision/analyze.ts` tiene un prompt por tipo, porque un plano y una foto de
fachada aportan evidencias completamente distintas:

| Tipo | Qué se le pide |
|---|---|
| `floor_plan` | Espacios, muros, vanos, circulación, cotas impresas, coordenadas en metros |
| `facade` | Plantas, huecos, cubierta, materiales. **Sin dimensiones en planta** |
| `interior` | Tipo de espacio, proporciones, acabados. Dimensiones casi siempre `unknown` |
| `sketch` | Topología y adyacencias. Todo estimado salvo lo escrito |
| `site` | Linderos, dimensiones, orientación, accesos |
| `reference` | Estilo, materiales, carácter. **No intenta sacar planta** |
| `not_architectural` | Se rechaza limpiamente |

## Añadir un tipo nuevo

1. Añádelo a `ImageKind` en `packages/ai/src/vision/schema.ts`.
2. Escribe su instrucción en `KIND_INSTRUCTIONS` (`analyze.ts`). Sé explícito sobre qué
   evidencia **no** aporta ese tipo — es lo que evita que el modelo rellene.
3. Añádelo al enum del clasificador, en `classifyImage`.
4. Si necesita campos propios, extiende `ArchitecturalExtraction`.
5. Test en `vision.test.ts`.

## Captura del viewport

`review_viewport` renderiza lo que el usuario está viendo y se lo pasa al modelo. Sirve para
lo que el scene graph no puede contestar: si un espacio *se ve* equilibrado, si una fachada
*lee* como moderna.

La captura la hace el host, no `packages/ai`:

```ts
// apps/editor/components/copilot/viewport-capture.ts
const canvas = document.querySelector('canvas')
return canvas.toDataURL('image/png')
```

Se reescala a 1280 px de lado máximo. Un canvas 4K son megabytes de base64 sin ningún
detalle extra útil, y todos esos bytes se facturan como tokens de entrada.

Si la captura falla, la herramienta lo dice y el modelo contesta con los datos de la escena.
