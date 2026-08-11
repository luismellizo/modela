# El copiloto

## El reparto: modelo en el servidor, herramientas en el navegador

Un agente que controla un CAD tiene dos requisitos que tiran en direcciones opuestas:

1. **La clave de API no puede llegar al navegador.** Cualquiera abriría devtools y la tendría.
2. **Las herramientas tienen que tocar la escena viva**, la que el usuario está viendo. Si
   mutas una copia en el servidor, pierdes el feedback en vivo y rompes el undo nativo.

La solución no es elegir uno: es partir el bucle.

```
navegador                                     servidor
─────────                                     ────────
useCopilot
   │
   ├─ agente ──────────► /api/copilot ──────► OpenRouter
   │      ▲                                       │
   │      └───────── eventos SSE ◄────────────────┘
   │
   └─ herramientas ──► SceneOperations ──► SceneBridge ──► useScene ──► viewport
```

El bucle del agente vive en el cliente. Cuando necesita al modelo, llama a `/api/copilot`,
que es un proxy con credenciales y nada más. Cuando el modelo pide una herramienta, se
ejecuta ahí mismo, contra la escena real, y el usuario ve aparecer los muros.

Esto es posible porque `AIProvider` es una interfaz:

- en el servidor, `createOpenRouterProvider` habla con el vendor y tiene la clave;
- en el cliente, `createHttpProvider` habla con `/api/copilot` y no tiene ninguna.

Los dos implementan el mismo contrato, así que el agente no sabe ni le importa cuál tiene.

## Un turno, paso a paso

```
usuario escribe / adjunta
        ↓
useCopilot.send()
        ↓
resumen de escena  ──►  prompt del sistema      ← reconstruido en cada turno
        ↓
agente: while (pasos < maxSteps)
        │
        ├─ provider.generate({ mensajes, tools })
        │        └─ stream: text-delta, tool-call-delta, message
        │
        ├─ ¿tool calls?  no → fin
        │
        └─ por cada llamada:
              ├─ validar argumentos contra el schema Zod
              ├─ abrir la transacción si es la primera escritura
              ├─ ejecutar contra SceneOperations
              ├─ emitir tool-start / tool-end a la UI
              └─ devolver el resultado (o el error) al modelo
        ↓
commit de la transacción → un solo paso de undo
        ↓
turn-end
```

### Por qué el prompt del sistema se reconstruye cada turno

`buildSceneSummary` lee el store **en el momento**. Si el usuario movió un muro a mano
entre dos mensajes, el modelo lo ve. Y si la conversación dijo "tiene 3 habitaciones" pero
la escena tiene 4, gana la escena. El estado real siempre pesa más que lo que se dijo.

### Por qué los errores de herramienta no cortan el turno

Un argumento mal puesto no es un fallo del sistema, es parte del trabajo. El error vuelve
al modelo como resultado de la herramienta, con un `hint` accionable, y el modelo corrige.
Solo se aborta por fallo del proveedor, cancelación o tope de pasos.

```ts
// packages/ai/src/tools/registry.ts
return { ok: false, code: 'invalid_arguments', message, hint }
```

Nunca lanza para problemas de nivel herramienta. Lanzar sería quitarle al modelo la
información que necesita para arreglarlo.

## Las piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Bucle | `packages/ai/src/agent/agent.ts` | Orquesta pasos, herramientas, transacción, cancelación |
| Eventos | `packages/ai/src/agent/events.ts` | Único contrato entre agente y UI |
| Proveedor | `packages/ai/src/provider/` | Frontera con el vendor |
| Herramientas | `packages/ai/src/tools/` | Acciones tipadas sobre la escena |
| Contexto | `packages/ai/src/context/` | Qué ve el modelo de la escena |
| Memoria | `packages/ai/src/memory/` | Historial con compactación |
| Transacción | `packages/ai/src/transaction/` | N mutaciones → un undo |
| Prompt | `packages/ai/src/prompts/architect.ts` | Cómo funciona *este* editor |
| Ruta | `apps/editor/app/api/copilot/route.ts` | Proxy con credenciales |
| Hook | `apps/editor/components/copilot/use-copilot.ts` | Estado del panel |
| Panel | `apps/editor/components/copilot/` | UI |

`packages/ai` no importa React, ni el DOM, ni Three.js. Todo lo que necesita del navegador
—la selección, la captura del viewport— se le inyecta como función.

## Cancelación

`AbortController` desde el hook. Se comprueba en tres sitios: antes de cada paso, antes de
cada herramienta y dentro del stream del proveedor.

Cancelar **detiene** el trabajo; no lo revierte. Lo ya construido se queda, y la transacción
igualmente se cierra, así que ese trozo parcial también se deshace con un solo `Ctrl+Z`.
Revertir automáticamente al cancelar sería peor: a veces cancelas justamente porque ya
tienes lo que querías.
