# Añadir una herramienta

## Antes de escribir nada

Busca en `packages/mcp/src/tools/`. Hay ~45 herramientas MCP ya escritas contra
`SceneOperations`. Si la tuya existe ahí, envuélvela; no la reimplementes.

Y pregúntate si hace falta. **Cada herramienta cuesta tokens en cada mensaje**, porque su
schema viaja en todas las peticiones. El copiloto expone ~17 de las 45 a propósito. Ver
[`contexto.md`](contexto.md).

## Anatomía

```ts
import { z } from 'zod'
import { defineTool, ToolError } from '../types'

export const miHerramienta = defineTool({
  name: 'add_skylight',
  kind: 'write',           // 'read' no toca la escena → no abre transacción
  risk: 'safe',            // 'destructive' exige confirmación del usuario
  description:
    'Add a skylight to a roof segment. t is 0..1 along the slope.',
  input: z.object({
    roofSegmentId: z.string().min(1),
    t: z.number().min(0).max(1).describe('Fraction along the slope'),
    widthM: z.number().positive().max(4).optional(),
  }),
  handler: (args, context) => {
    const roof = context.scene.getNode(args.roofSegmentId as AnyNodeId)
    if (!roof) {
      throw new ToolError('not_found', `No roof segment "${args.roofSegmentId}"`,
        'Call find_nodes with type "roof-segment".')
    }
    const node = SkylightNode.parse({ /* … */ })
    const id = context.scene.createNode(node, args.roofSegmentId as AnyNodeId)
    return { skylightId: id }
  },
})
```

Registrarla: añadirla al array que devuelve `createSceneTools()` en
`packages/ai/src/tools/scene/index.ts`.

## Lo que da el sistema gratis

- **Validación.** Argumentos parseados con el schema antes de llegar al handler.
- **Errores.** Cualquier throw se convierte en un resultado que vuelve al modelo.
- **JSON Schema.** `z.toJSONSchema` genera el contrato que ve el modelo. Escribe
  `.describe()` en los campos que no sean obvios: ahí es donde el modelo aprende a usarla.
- **Confirmación.** `risk: 'destructive'` se rechaza con `needs_confirmation` hasta que el
  usuario aprueba.
- **Transacción.** `kind: 'write'` entra en el paso de undo del turno.

## Lo que tienes que hacer tú

### Validar contra el dominio, no solo contra el schema

Zod comprueba que `t` está entre 0 y 1. No comprueba que la puerta quepa en el muro:

```ts
if (length < width) {
  throw new ToolError(
    'invalid_arguments',
    `Wall is ${length.toFixed(2)} m long, too short for a ${width.toFixed(2)} m door`,
    'Pick a longer wall or a narrower door.',
  )
}
```

### Poner límites

`context.limits` trae los topes. Úsalos:

```ts
assertWithinBounds(context.limits, args.polygon.flat())
assertNodeBudget(context.limits, args.polygon.length + 3)
```

Sin esto, un modelo confundido crea un polígono de 200 lados a 900.000 metros del origen.

### Escribir `hint` en cada error

El `hint` es lo que le dice al modelo cómo salir del agujero. Sin él, reintenta la misma
llamada fallida. Con él, la arregla al primer intento.

### Devolver datos, no prosa

```ts
return { wallId: id, lengthM: 4.2, clamped: true }   // ✅
return { message: 'Created a 4.2 m wall' }            // ❌
```

El modelo redacta la prosa. Lo que necesita de ti son ids y números que pueda encadenar.

## Cambios que afectan a varios nodos

Usa `applyPatch`. Valida todos los patches en seco antes de aplicar ninguno, así que o
entra todo o no entra nada, y queda como **una** entrada de historial:

```ts
context.scene.applyPatch([
  { op: 'create', node: zone, parentId: levelId },
  { op: 'create', node: slab, parentId: levelId },
  ...walls.map((wall) => ({ op: 'create' as const, node: wall, parentId: levelId })),
])
```

## Tests

Sin test, no entra. El patrón está en `packages/ai/src/tools/scene/tools.test.ts`:

```ts
const outcome = await call('add_skylight', { roofSegmentId: 'roof_1', t: 0.5 })
expect(outcome.ok).toBe(true)
```

Cubre como mínimo: el camino feliz, argumentos inválidos, el nodo que no existe, y el
límite superado.

## Exponerla también por MCP

Si tiene sentido para hosts externos, escribe además el registro MCP en
`packages/mcp/src/tools/`. Las dos versiones comparten `SceneOperations`, así que el
comportamiento no se separa. Ver [`mcp.md`](mcp.md).
