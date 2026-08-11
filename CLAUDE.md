# CLAUDE.md — Modela

> Documento vivo. **Se actualiza en cada avance** (ver `RULES.md`, regla #1).
> Última actualización: 2026-08-11 · Fase actual: **1 — MVP del copiloto**

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
| 1 | Chat nativo, provider, tools, contexto, undo único | 🚧 en curso |
| 2 | Imágenes, visión, plano → escena | ⬜ pendiente |
| 3 | Agent loop, validación, autocorrección, alternativas | ⬜ pendiente |
| 4 | Memoria de proyecto, knowledge base, optimización | ⬜ pendiente |

Planes detallados en [`docs/planes/`](docs/planes/).

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
`<Editor sidebarTabs={...}>` en `apps/editor/app/page.tsx`. El componente acepta paneles del
host como pestañas de primera clase (`packages/editor/src/components/editor/index.tsx:145`).
El copiloto entra por ahí — **cero cambios en `packages/editor`**.

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

Copiar `.env.example` a `.env.local`. Ver `docs/arquitectura/configuracion.md`.

| Variable | Requerida | Para qué |
|---|---|---|
| `MODELA_AI_PROVIDER` | no | `openrouter` (por defecto) o `mock` |
| `OPENROUTER_API_KEY` | sí, para IA real | clave de https://openrouter.ai/keys |
| `MODELA_AI_MODEL` | no | modelo de texto+visión |
| `MODELA_AI_MAX_STEPS` | no | tope de iteraciones del agent loop |

Las claves **solo viven en el servidor**. El navegador habla con `/api/copilot`.

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
