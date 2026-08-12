# CLAUDE.md — Modela

> Documento vivo. **Se actualiza en cada avance** (ver `RULES.md`, regla #1).
> Última actualización: 2026-08-11 · Fases 0–2 completas · 3 y 4 avanzadas
> Siguiente: **probarlo con un modelo real** (ver «Pendiente» al final)

---

## Qué es Modela

Editor arquitectónico 3D con un **copiloto de IA que controla el CAD**, no un chatbot al lado.
El usuario describe, muestra o modifica un proyecto con lenguaje natural e imágenes, y el agente
actúa sobre el Scene Graph con herramientas tipadas y validadas.

Fork de [`pascalorg/editor`](https://github.com/pascalorg/editor) (MIT). El editor base se
conserva íntegro; Modela añade la capa de IA encima.

---

## Estado del proyecto

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Fork, docs, reglas, branding | ✅ hecho |
| 1 | Chat nativo, provider, tools, contexto, undo único | ✅ hecho |
| 2 | Imágenes, visión, plano → escena | ✅ hecho |
| 3 | Agent loop, validación, autocorrección, alternativas | 🚧 falta intención/planner |
| 4 | Memoria de proyecto, knowledge base, optimización | 🚧 falta catálogo/branching |

Planes detallados en [`docs/planes/`](docs/planes/).
Arquitectura de la capa de IA en [`docs/arquitectura/`](docs/arquitectura/).

---

## Mapa del repositorio

Turborepo. Package manager **bun 1.3.14**. Next 16 · React 19 · TypeScript 6 · Biome · three.js 0.185.

```
apps/
  editor/              # App Next.js — compone viewer + editor + el copiloto
  ifc-converter/       # Utilidad IFC (upstream)
packages/
  core/                # Scene graph, schemas Zod, store Zustand, historial. Sin Three.js
  viewer/              # Canvas 3D (R3F): renderers, sistemas de vista
  editor/              # UI de edición: paneles, herramientas, selección
  nodes/               # Definiciones de nodos (wall, window, zone, stair, roof…)
  mcp/                 # Servidor MCP + SceneBridge + SceneOperations + storage
  ui/                  # Componentes compartidos
  ai/                  # ★ MODELA — provider, agente, tools, contexto, memoria
  brand/               # ★ MODELA — configuración de marca (nombre, colores, textos)
tooling/               # Configs de TypeScript y release
docs/
  planes/              # Planes de fase 0→4
  arquitectura/        # Documentación técnica del copiloto
```

★ = añadido por Modela. El resto es upstream de Pascal y **no se reescribe**.

---

## Las piezas que importan

### Scene Graph
- **Nodos**: `packages/core/src/schema/nodes/*.ts` — cada tipo es un schema Zod
  (`wall`, `window`, `zone`, `level`, `building`, `site`, `item`, `stair`, `roof`, …).
- **Store**: `packages/core/src/store/use-scene.ts` — Zustand + Zundo (temporal).
- **Mutaciones**: `packages/core/src/store/actions/node-actions.ts` — `createNode(s)`,
  `updateNode(s)`, `deleteNode(s)`. Sanitizan valores numéricos contra el schema.

### Capa de dominio para el agente (la clave)
- **`SceneBridge`** — `packages/mcp/src/bridge/scene-bridge.ts`
  Habla directamente con el `useScene` vivo. `applyPatch()` valida **todos** los patches en
  dry-run antes de aplicar ninguno (atómico). `getNode`, `findNodes`, `getAncestry`,
  `resolveLevelId`, `validateScene`, `undo`, `redo`, `getHistory`.
- **`SceneOperations`** — `packages/mcp/src/operations/scene-operations.ts`
  Fachada sobre `SceneBridge` + `SceneStore`. **Es la interfaz que consume el agente.**
  Los ~45 tools MCP existentes ya están escritos contra ella.

> Regla: el agente **nunca** toca componentes React ni el store directamente. Solo `SceneOperations`.

### Historial / undo
- `packages/core/src/store/history-control.ts`
  - `runAsSingleSceneHistoryStep(store, fn)` — colapsa N mutaciones en **un** paso de undo.
    Es **síncrono**, así que no envuelve un turno completo del agente (que es async).
  - `pauseSceneHistory` / `resumeSceneHistory` / `acquireSceneHistoryPause`.
  - `notifySceneCommit`, `subscribeSceneCommit` — bus de commits de escena.
- Modela colapsa el turno async con `packages/ai/src/transaction/` reusando la misma
  aritmética de `retainedPastStateCount`. Ver `docs/arquitectura/transacciones.md`.

### Tools MCP ya existentes (no duplicar)
`create_wall` · `create_level` · `create_room` · `create_roof` · `create_story_shell` ·
`create_stair_between_levels` · `add_door` · `add_window` · `cut_opening` · `place_item` ·
`furnish_room` · `set_zone` · `apply_patch` · `delete_node` · `duplicate_level` ·
`get_scene` · `get_node` · `describe_node` · `find_nodes` · `get_walls` · `get_zones` ·
`get_levels` · `list_levels` · `get_level_summary` · `measure` · `check_collisions` ·
`validate_scene` · `verify_scene` · `undo` · `redo` · `generate_variants` ·
`create_from_template` · `create_house_from_brief` · `list_templates` · `search_assets` ·
`export_json` · `export_glb` · `save_scene` · `load_scene` · `list_scenes` · `delete_scene` ·
`rename_scene` · `create_project` · `get_project_status` ·
`analyze_floorplan_image` · `analyze_room_photo` · `photo_to_scene`

Registro: `packages/mcp/src/tools/index.ts` y `packages/mcp/src/tools/vision/index.ts`.

### Selección
`packages/viewer/src/store/use-viewer.ts` → `useViewer.getState().selection`:
```ts
{ buildingId, levelId, zoneId, selectedIds }
```
Es el contexto de "haz **esto** más grande".

### Punto de integración de la UI
`<Editor sidebarTabs={...}>` en `apps/editor/app/page.tsx` y en
`apps/editor/components/scene-loader.tsx`. El componente acepta paneles del host como
pestañas de primera clase (`packages/editor/src/components/editor/index.tsx:145`).
El copiloto entra por ahí — **cero cambios en `packages/editor`**.

---

## Lo que construyó Modela

### `packages/ai` — el motor
| Módulo | Qué es |
|---|---|
| `provider/` | `AIProvider` + adaptadores `openrouter`, `mock` y `http` (cliente sin credenciales) |
| `agent/agent.ts` | Bucle plan→ejecutar→observar, cancelable, con tope de pasos |
| `agent/events.ts` | Único contrato entre agente y UI |
| `agent/proposal.ts` | Tipos y validación de un plan antes de enseñarlo |
| `agent/apply-proposal.ts` | Ejecuta un plan aprobado sin volver a llamar al modelo |
| `validation/` | 7 reglas arquitectónicas computables sobre el grafo + motor extensible |
| `alternatives/snapshots.ts` | Guardar y recuperar diseños; red de seguridad al restaurar |
| `memory/project.ts` | El encargo, persistido en localStorage. La escena siempre le gana |
| `knowledge/` | 15 fichas de dimensiones convencionales, con su base y por región |
| `optimization/` | 6 objetivos puntuables sobre el grafo + comparación razonada |
| `tools/` | 29 herramientas tipadas con Zod: escena, visión, plan, revisión, snapshots, encargo, puntuación |
| `provider/catalog.ts` | Catálogo de OpenRouter filtrado por gratis + tool calling |
| `context/scene-context.ts` | Resumen compacto (~400 tokens en vez de ~120.000) |
| `memory/conversation.ts` | Recorte por turnos y recibos de resultados antiguos |
| `transaction/history.ts` | Colapso asíncrono a un solo paso de undo |
| `vision/` | Validación por bytes, extracción `observed`/`inferred`/`unknown`, plan de obra |
| `prompts/architect.ts` | Cómo funciona *este* editor, no arquitectura genérica |
| `testing/fake-scene.ts` | `SceneOperations` falso con historial, para tests sin navegador |

### `apps/editor` — la experiencia
| Pieza | Ruta |
|---|---|
| Proxy con la clave | `app/api/copilot/route.ts` |
| Panel («Estudio») | `components/copilot/assistant-panel.tsx` |
| Estado | `components/copilot/use-copilot.ts` |
| Puente a la escena viva | `components/copilot/scene-operations.ts` |
| Tarjeta de plan y confirmación | `components/copilot/proposal-card.tsx` |
| Resultado de la revisión de diseño | `components/copilot/design-check.tsx` |
| Alternativas guardadas | `components/copilot/alternatives.tsx` |
| Selector de modelo | `components/copilot/model-picker.tsx` |
| Catálogo y validación de modelos | `lib/model-catalog.ts` + `app/api/copilot/models/route.ts` |
| Captura del viewport | `components/copilot/viewport-capture.ts` |

### `packages/brand` — la marca
Nombre, colores, textos, URLs, metadata y atribución. Cambiar la marca es editar
`src/index.ts` y nada más.

### Cambio en upstream
`packages/mcp/package.json` gana dos subpaths de exports (`./tools/geometry`,
`./tools/asset-catalog`). Aditivo: el merge con upstream sigue limpio.

---

## Fronteras de capas (heredadas de Pascal, se respetan)

- `packages/core` — datos y lógica pura. No importa Three.js, ni viewer, ni app.
- `packages/viewer` — canvas 3D. No conoce `useEditor`, ni herramientas, ni modos del editor.
- `apps/editor` — la experiencia de edición. Inyecta features en `<Viewer>` vía props.
- `packages/ai` — **sin React, sin DOM**. Recibe `SceneOperations` inyectado.
  Los hooks y componentes viven en `apps/editor/components/copilot/`.

Detalle en `AGENTS.md` y `wiki/architecture/`.

---

## Comandos

```bash
./start.sh               # comprueba entorno, instala y arranca
./start.sh --check       # solo comprueba el entorno
bun install              # instalar dependencias
bun dev                  # editor en http://localhost:3002
bun test                 # tests de todos los paquetes
bun run check-types      # typecheck (turbo)
bun run check            # biome lint + format
bun run check:fix        # corregir automáticamente
bun run build            # build de producción
```

Un solo paquete: `bun test packages/ai` · `cd packages/ai && bun test`.

---

## Variables de entorno

Copiar `.env.example` a `.env.local`. Detalle en
[`docs/arquitectura/configuracion.md`](docs/arquitectura/configuracion.md).

| Variable | Requerida | Para qué |
|---|---|---|
| `OPENROUTER_API_KEY` | sí, para IA real | clave de https://openrouter.ai/keys |
| `MODELA_AI_PROVIDER` | no | `openrouter` (por defecto) o `mock` |
| `MODELA_AI_MODEL` | no | slug del modelo (necesita tool calling y visión) |
| `MODELA_AI_VISION_MODEL` | no | modelo aparte para imágenes |
| `MODELA_AI_MAX_STEPS` | no | tope de iteraciones del agent loop (24) |
| `MODELA_AI_ENDPOINT` | no | otra pasarela compatible con OpenAI |
| `MODELA_AI_FREE_ONLY` | no | `1` limita a modelos gratis; lo **valida el servidor** |

Todas se leen en un único sitio: `packages/ai/src/config.ts`.
Las claves **solo viven en el servidor**; el navegador habla con `/api/copilot`.
Ninguna variable de IA lleva prefijo `NEXT_PUBLIC_` — hacerlo la filtraría al bundle.

---

## Convenciones

- **Commits en español**, cortos y claros. Ver `RULES.md`.
- Biome, no ESLint/Prettier. Comillas simples, sin punto y coma.
- Comentarios solo para explicar el *porqué* no obvio.
- Nada de shims de retrocompatibilidad, código muerto ni abstracciones especulativas.
- Todo tool nuevo lleva schema Zod + test.

---

## Registro de avances

| Fecha | Avance |
|---|---|
| 2026-08-11 | Fork de `pascalorg/editor`, remote `upstream` conservado, docs base y reglas |
| 2026-08-11 | `packages/ai`: proveedor, agente, herramientas, contexto, memoria, transacción |
| 2026-08-11 | Copiloto montado como pestaña del editor + `packages/brand` |
| 2026-08-11 | Fase 2: visión estructurada, `analyze_image`, `review_viewport`, captura del viewport |
| 2026-08-11 | Documentación de arquitectura en `docs/arquitectura/` |
| 2026-08-11 | Propuestas revisables y confirmación de operaciones destructivas |
| 2026-08-11 | Reglas arquitectónicas + autocorrección: detecta, corrige y revalida |
| 2026-08-11 | Snapshots y alternativas: opciones sin destruir el diseño actual |
| 2026-08-11 | Memoria de proyecto persistente y base de conocimiento arquitectónico |
| 2026-08-11 | Puntuación de distribuciones y comparación razonada de alternativas |
| 2026-08-11 | Selector de modelos gratis, validación en servidor y `start.sh` |
| 2026-08-12 | El asistente se llama **Estudio**; UI en español; layout del panel arreglado |

---

## Pendiente

### 1. Probar los caminos que aún no se han recorrido

**Verificado en el navegador el 2026-08-11** con `nvidia/nemotron-nano-9b-v2:free`:
«Crea una habitación de 4 por 5 metros llamada Dormitorio» → `create_room` → cuatro muros,
losa y techo en el 3D → revisión automática → *«zone "Dormitorio" has no door — it cannot be
entered»* con el arreglo concreto → respuesta en español con los 20 m² correctos → botón
«Undo these changes».

Es decir: bucle, herramientas, escena viva, validación, idioma y undo único, funcionando.

Lo que **sigue sin probarse** con un modelo real:

| # | Qué pedir | Qué debería pasar |
|---|---|---|
| 1 | "Diseña una casa de 180 m² en un lote de 10 × 25 con 3 habitaciones y 2 baños" | Sale un **plan** con aplicar/descartar, no obra hecha |
| 2 | Seleccionar un muro → "haz esto 20 cm más alto" | Afecta a ese muro y no a otro |
| 3 | Adjuntar foto de un plano → "recréalo en 3D" | Lo no acotado marcado como estimado |
| 4 | "Dame otras dos opciones y dime cuál es mejor" | Tres diseños guardados, veredicto razonado |
| 5 | Lanzar algo largo y cancelar a mitad | Para y la escena queda coherente |
| 6 | Recargar la página | El encargo sigue ahí (`localStorage`) |
| 7 | Pedir un borrado | Tarjeta de confirmación antes de tocar nada |

```bash
./start.sh          # http://localhost:3002 → pestaña «Copilot»
```

Guion de aceptación:

| # | Qué pedir | Qué debería pasar |
|---|---|---|
| 1 | "Diseña una casa de 180 m² en un lote de 10 × 25 con 3 habitaciones y 2 baños" | Sale un **plan** con aplicar/descartar, no obra hecha |
| 2 | Aplicar el plan | Los espacios aparecen en el viewport mientras corre |
| 3 | `Ctrl+Z` **una vez** | Desaparece **todo** el turno |
| 4 | Seleccionar un muro → "haz esto 20 cm más alto" | Afecta a ese muro y no a otro |
| 5 | "Mueve la cocina 1.5 m a la derecha" | Se mueve la cocina |
| 6 | Adjuntar foto de un plano → "recréalo en 3D" | Muros y espacios reconocibles; lo no acotado marcado como estimado |
| 7 | "¿Qué problemas tiene esta distribución?" | Incidencias reales, con ids que existen |
| 8 | "Dame otras dos opciones y dime cuál es mejor" | Tres diseños guardados, la actual intacta, veredicto razonado |
| 9 | Lanzar algo largo y cancelar a mitad | Para y la escena queda coherente |
| 10 | Recargar la página | El encargo sigue ahí (`localStorage`) |

Los modelos gratis son más flojos que los de pago en tool calling. Si el agente se atasca,
probar otro desde el selector antes de dar por roto el código.

### 2. Fase 3 — lo que falta

- **Clasificador de intención** (`agent/intent.ts`): enrutar la petición y cargar solo el
  contexto que esa intención necesita. Hoy el prompt lo decide todo.
- **Planificador estructurado** (`agent/planner.ts`): petición → plan sin pasar por el modelo
  dos veces.

Ambos son pulido interno. No añaden capacidad, la abaratan.

### 3. Fase 4 — lo que falta

- **Extracción automática de hechos**: hoy el agente llama `remember_project_fact` porque el
  prompt se lo pide. Debería salir de la conversación sin pedírselo.
- **Catálogo enriquecido**: `search_assets` devuelve dimensiones, no holguras ni estilo ni
  coste relativo. Sin eso, "amueblar en estilo nórdico con presupuesto medio" no se puede
  hacer honestamente.
- **Amueblado por estilo y presupuesto**: depende del punto anterior.
- **Branching persistente**: los snapshots viven en memoria y mueren al recargar. Persistirlos
  va por el `SceneStore` de `packages/mcp/src/storage/`, no por un segundo almacenamiento.

### 4. Modelos gratis: lo que se vio al probarlos

Primera llamada real del proyecto a un modelo (2026-08-11, contra OpenRouter):

| Modelo | Latencia | Tool call |
|---|---|---|
| `openai/gpt-oss-20b:free` | 3.7 s | correcto |
| `google/gemma-4-26b-a4b-it:free` | 3.2 s | correcto, **cierra el polígono** |
| `nvidia/nemotron-nano-9b-v2:free` | 13.3 s | correcto |
| `google/gemma-4-31b-it:free` | — | `rate_limited` |

Tres cosas aprendidas:

- Los gratis **sí** hacen tool calling bien. El cuello es el rate limit, no la capacidad.
- Gemma repite el primer punto para cerrar el anillo. `Polygon` ahora lo descarta: si no,
  se creaba un muro de longitud cero que la revisión de diseño achacaba al usuario.
- **Los schemas de Zod no valen tal cual.** Las APIs de function calling aceptan un dialecto
  mucho más pequeño y rechazan la lista **entera** en vez de ignorar lo que no conocen:

  ```
  properties[start].items: missing field          ← prefixItems (tuplas)
  unsupported assertions or reserved metadata     ← propertyNames, pattern, default…
  ```

  `normalizeJsonSchema` recorta a una lista blanca. **El schema anunciado es una pista; Zod
  es la puerta** — quitar `minimum` no deja pasar un valor malo, porque `registry.execute`
  sigue parseando contra el schema completo.

Si el agente se atasca, cambiar de modelo en el selector antes de sospechar del código:
los rate limits del gratis son frecuentes y se ven igual que un fallo.

### 5. Deudas conocidas

- **El umbral de propuesta vive en el prompt**, no en código. `DEFAULT_PROPOSAL_THRESHOLDS`
  está expuesto pero no se aplica. Si en la práctica el modelo propone poco, endurecerlo.
- **`facingOf` no tiene brújula**: "norte" es −Z en planta. La orientación real se le pregunta
  al usuario; no está guardada en el proyecto.
- **`classifySpace` va por nombre.** Es lo más blando de la capa de puntuación. Una zona
  llamada "Zona 3" queda fuera de todos los objetivos que dependen del tipo.
- **`reshape_space` empareja muros por metadata de creación.** Un polígono con distinto número
  de aristas avisa en vez de adivinar, pero no lo resuelve.
- **Sin tests de la UI.** `packages/ai` está cubierto; los componentes del panel no. Los dos
  fallos de layout (composer fuera de pantalla, desplegable recortado) solo se vieron mirando.
- **Error de hidratación en `BuildTab`**, de upstream: el plugin Streetscape registra su
  herramienta solo en cliente, así que la lista del servidor va desfasada una posición. No es
  de la capa de IA y no se ha tocado.
- **Nunca importar el barrel de `@pascal-app/core`** desde `packages/ai`: arrastra sistemas de
  React Three Fiber y revienta en el servidor. Typecheck, tests y build pasaban igual; solo se
  vio ejecutándolo. Hay test que lo impide (`src/imports.test.ts`).

### 6. Seguridad

- `.env.local` está gitignoreado y **nunca** debe commitearse. El repo es público.
- La clave actual se pegó en un chat: **rotarla** en https://openrouter.ai/keys antes de
  usar el proyecto en serio.
- El modo solo-gratis lo valida el servidor (`lib/model-catalog.ts`), no el selector. Un
  límite que el cliente puede saltarse no es un límite.
