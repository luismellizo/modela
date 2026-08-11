# Configuración, ejecución y testing

## Requisitos

- [Bun](https://bun.sh) 1.3+ — es el package manager del repo, no opcional
- Node 20+
- Una clave de [OpenRouter](https://openrouter.ai/keys) para el copiloto

## Arrancar

```bash
bun install
cp .env.example .env.local
bun dev                        # http://localhost:3002
```

El editor arranca sin clave. El panel del copiloto aparece igual y explica qué falta:

> No AI provider configured. Add OPENROUTER_API_KEY to .env.local and restart the dev server.

## Variables de entorno

Todas se leen en un solo sitio: `packages/ai/src/config.ts`.

| Variable | Requerida | Por defecto | Qué hace |
|---|---|---|---|
| `OPENROUTER_API_KEY` | para la IA | — | Clave del proveedor. **Solo servidor** |
| `MODELA_AI_PROVIDER` | no | `openrouter` | `openrouter` o `mock` |
| `MODELA_AI_MODEL` | no | `anthropic/claude-sonnet-4.5` | Slug del modelo |
| `MODELA_AI_VISION_MODEL` | no | = `MODELA_AI_MODEL` | Modelo para imágenes |
| `MODELA_AI_MAX_STEPS` | no | `24` | Tope de iteraciones por turno |
| `MODELA_AI_ENDPOINT` | no | OpenRouter | Otra pasarela compatible con OpenAI |
| `PORT` | no | `3002` | Puerto de desarrollo |

### La clave no llega al navegador

`OPENROUTER_API_KEY` no lleva prefijo `NEXT_PUBLIC_`, así que Next no la incluye en el
bundle. Solo la lee `app/api/copilot/route.ts`, que corre en el servidor. El cliente usa
`createHttpProvider`, que no tiene credenciales de ningún tipo.

Si alguna vez añades una variable de IA con `NEXT_PUBLIC_`, la estás filtrando.

### Elegir modelo

Cualquier slug de OpenRouter con:

- **tool calling** — obligatorio, sin esto el agente no puede actuar;
- **visión** — necesario para los adjuntos de imagen.

```bash
MODELA_AI_MODEL=anthropic/claude-sonnet-4.5
MODELA_AI_MODEL=openai/gpt-5
MODELA_AI_MODEL=google/gemini-2.5-pro
```

Se puede separar el modelo de visión, que suele ser más barato:

```bash
MODELA_AI_MODEL=anthropic/claude-sonnet-4.5
MODELA_AI_VISION_MODEL=google/gemini-2.5-flash
```

### Modo mock

```bash
MODELA_AI_PROVIDER=mock
```

Respuestas deterministas, sin clave y sin coste. Sirve para tests y para enseñar la UI. Se
identifica como `mock` en la configuración y en la interfaz, para que nadie confunda su
salida con la de un modelo real.

## Comandos

```bash
bun dev                  # servidor de desarrollo
bun test                 # tests de todos los paquetes
bun run check-types      # typecheck del monorepo
bun run check            # biome lint + formato
bun run check:fix        # corregir lo corregible
bun run build            # build de producción
bun run kill             # matar lo que ocupe el puerto 3002
bun run clean:cache      # limpiar cachés de Next y turbo
```

Un paquete suelto:

```bash
cd packages/ai && bun test
bun test src/agent                      # un directorio
bun test --test-name-pattern "undo"     # por nombre
```

## Testing

### Cómo se prueba un agente

Dos piezas hacen que no haga falta ni red ni navegador:

**`createMockProvider`** — un turno es un dato:

```ts
const provider = createMockProvider({
  turns: [
    { toolCalls: [{ name: 'create_room', arguments: { name: 'Sala', polygon, levelId } }] },
    { text: 'Sala creada, 20 m².' },
  ],
})
```

**`createFakeScene`** — implementa `SceneOperations` sobre un mapa de nodos, con historial
falso incluido, así que las transacciones se pueden verificar de verdad:

```ts
const scene = createFakeScene()
const { levelId } = seedBuilding(scene)
expect(scene.getHistory().pastCount - before).toBe(1)
```

### Qué está cubierto

| Área | Archivo |
|---|---|
| Bucle, herramientas, cancelación, tope, errores de proveedor | `src/agent/agent.test.ts` |
| Registro, validación, límites, confirmación de destructivas | `src/tools/scene/tools.test.ts` |
| Visión: extracción, plan, degradación | `src/tools/vision-tools.test.ts` |
| Validación de imágenes, esquema, materialización | `src/vision/vision.test.ts` |
| Colapso de undo, truncación de historial | `src/transaction/history.test.ts` |
| Recortes y recibos de memoria | `src/memory/conversation.test.ts` |
| Lectura de configuración | `src/config.test.ts` |
| Integridad de la marca y atribución | `packages/brand/src/brand.test.ts` |

### Antes de dar algo por terminado

```bash
bun run check-types
bun run check
bun test
```

Los tres en verde. Ver `RULES.md`.

## Comprobación manual con clave real

Los tests no prueban que el modelo entienda arquitectura. Eso se comprueba a mano:

1. `bun dev`, abre el editor, pestaña **Copilot**.
2. "Diseña una casa de 180 m² para un lote de 10 × 25 con 3 habitaciones y 2 baños."
   Deberías ver aparecer los espacios mientras trabaja.
3. `Ctrl+Z` **una vez**. Debe desaparecer todo.
4. Selecciona un muro y di "haz esto 20 cm más alto".
5. Adjunta la foto de un plano y di "recréalo en 3D". Comprueba que lo que no estaba
   acotado aparece marcado como estimado.
6. Lanza una operación larga y cancélala a mitad. La escena debe quedar coherente.

## Problemas frecuentes

**"Cannot find module '@pascal-app/viewer'"** al hacer typecheck de un paquete suelto: los
paquetes upstream se compilan a `dist/`. Usa `bun run check-types` desde la raíz, que
turbo encadena con los builds.

**El copiloto dice que no está configurado con la clave puesta**: la clave va en
`.env.local` (no en `.env.example`) y el servidor de desarrollo hay que reiniciarlo.

**`review_viewport` devuelve una captura vacía**: el canvas WebGL necesita conservar el
buffer de dibujo. Si el comando "Take Screenshot" del editor funciona, esto también.
