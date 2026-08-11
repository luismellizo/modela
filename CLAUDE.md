# CLAUDE.md — Modela

> Documento vivo. **Se actualiza en cada avance** (ver `RULES.md`, regla #1).
> Última actualización: 2026-08-11 · Fases 1 y 2 completas, 3 avanzada · Siguiente: **intención y planner**

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
| 4 | Memoria de proyecto, knowledge base, optimización | ⬜ pendiente |

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
| `tools/` | 23 herramientas tipadas con Zod: escena, visión, propuesta, revisión, snapshots |
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
| Panel | `components/copilot/copilot-panel.tsx` |
| Estado | `components/copilot/use-copilot.ts` |
| Puente a la escena viva | `components/copilot/scene-operations.ts` |
| Tarjeta de plan y confirmación | `components/copilot/proposal-card.tsx` |
| Resultado de la revisión de diseño | `components/copilot/design-check.tsx` |
| Alternativas guardadas | `components/copilot/alternatives.tsx` |
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
