# Añadir un proveedor de IA

Un proveedor es cualquier cosa que sepa hablar con un modelo. Añadir uno son dos archivos
tocados y cero cambios en el agente, las herramientas o la UI.

## El contrato

```ts
// packages/ai/src/provider/types.ts
export type AIProvider = {
  readonly id: string
  readonly model: string
  readonly supportsVision: boolean
  readonly supportsTools: boolean

  generate(request: GenerateRequest): AsyncIterable<ProviderEvent>
  analyzeImage(request: ImageAnalysisRequest): Promise<unknown>
}
```

`generate` emite:

| Evento | Cuándo |
|---|---|
| `text-delta` | Fragmento de texto |
| `tool-call-delta` | Fragmento de una llamada a herramienta |
| `message` | **Obligatorio al final.** El turno ensamblado + uso de tokens |
| `error` | Fallo dentro del stream |

El `message` final es lo que hace que nadie aguas abajo tenga que reensamblar deltas.
Un proveedor que no lo emite hace que el agente termine el turno con `empty_response`.

## Pasos

### 1. Escribir el adaptador

`packages/ai/src/provider/mi-vendor.ts`:

```ts
import { type AIProvider, ProviderError } from './types'

export function createMiVendorProvider(config: MiVendorConfig): AIProvider {
  return {
    id: 'mi-vendor',
    model: config.model,
    supportsVision: true,
    supportsTools: true,

    async *generate(request) {
      // 1. traducir request.messages al dialecto del vendor
      // 2. traducir request.tools (ya vienen como JSON Schema)
      // 3. consumir el stream y emitir eventos
      // 4. emitir { type: 'message', message, usage }
    },

    async analyzeImage(request) {
      // salida estructurada contra request.schema; devolver el JSON parseado
    },
  }
}
```

Reglas que no son opcionales:

- **Traducir los errores.** Un 401 es `missing_credentials`, un 429 es `rate_limited`.
  La UI y el agente reaccionan al código, no al texto.
- **Respetar `signal`.** Cancelar tiene que cortar la petición de verdad.
- **Emitir `message` siempre**, incluso si el texto va vacío.

Si el vendor habla el dialecto de OpenAI, no escribas nada: apunta el adaptador de
OpenRouter a su endpoint con `MODELA_AI_ENDPOINT`.

### 2. Registrarlo

`packages/ai/src/provider/registry.ts`:

```ts
export type ProviderId = 'openrouter' | 'mock' | 'mi-vendor'

const factories: Record<ProviderId, ProviderFactory> = {
  openrouter: /* … */,
  mock: /* … */,
  'mi-vendor': (config) => createMiVendorProvider({
    apiKey: config.apiKey!,
    model: config.model,
  }),
}
```

Ya está. `MODELA_AI_PROVIDER=mi-vendor` lo activa.

### 3. Si necesita una variable de entorno propia

`packages/ai/src/config.ts` es el único sitio que lee `process.env`. Añade la lectura ahí
y documéntala en `.env.example`, en el README y en `CLAUDE.md`.

## Probarlo

El proveedor mock existe para esto. Un turno es un dato:

```ts
const provider = createMockProvider({
  turns: [
    { toolCalls: [{ name: 'create_room', arguments: { name: 'Sala', polygon, levelId } }] },
    { text: 'Sala creada, 20 m².' },
  ],
})
```

Ver `packages/ai/src/agent/agent.test.ts` para el patrón completo, incluidos fallos y
cancelación.

## Modelos sin herramientas o sin visión

Declara `supportsTools: false` o `supportsVision: false`. El sistema se degrada en lugar de
romperse: la extracción de imágenes rechaza el trabajo con un mensaje claro en vez de
mandar una petición que el vendor no entiende.
