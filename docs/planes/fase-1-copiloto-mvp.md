# Fase 1 — Copiloto MVP

**Objetivo:** el usuario escribe "diseña una casa de 180 m² con 3 habitaciones" y **la escena
se construye sola**, en vivo, con un solo `Ctrl+Z` para revertirlo todo.

---

## Arquitectura

```
apps/editor/components/copilot/     UI — chat, composer, actividad de tools
        │
        ├── useCopilot()            hook: estado del chat, streaming, cancelación
        ↓
   /api/copilot  (route.ts)         servidor — la clave de API vive aquí
        │
        ↓
packages/ai/                        sin React, sin DOM
        ├── provider/               AIProvider + adaptadores (openrouter, mock)
        ├── agent/                  loop, planner, ejecutor de tools
        ├── context/                scene context retrieval
        ├── memory/                 memoria conversacional
        ├── tools/                  registro de tools tipadas
        └── transaction/            colapso de undo
        │
        ↓
   SceneOperations                  packages/mcp — ya existe, se reutiliza
        │
        ↓
   SceneBridge → useScene           el scene graph vivo del navegador
```

**Decisión clave:** los tools se ejecutan **en el navegador**, contra la escena viva, no contra
el store SQLite del servidor MCP. Así el usuario ve las paredes aparecer mientras el agente
trabaja, y el undo nativo funciona. El LLM se llama desde el servidor para no exponer la clave.

El flujo de un turno:

```
mensaje del usuario
  → /api/copilot  (streaming SSE)
  → LLM decide un tool call
  → el servidor emite el tool call al cliente
  → el cliente lo ejecuta contra SceneOperations
  → devuelve el resultado al servidor
  → el LLM continúa
  → …hasta que responde texto final
```

---

## Entregables

### `packages/ai`

| Módulo | Archivo | Responsabilidad |
|---|---|---|
| Provider | `provider/types.ts` | Interfaz `AIProvider`: `generateWithTools`, `analyzeImage` |
| OpenRouter | `provider/openrouter.ts` | Adaptador real, streaming, tool calling, visión |
| Mock | `provider/mock.ts` | Adaptador determinista para tests |
| Registro | `provider/registry.ts` | `createProvider(config)` — cambiar de modelo sin tocar nada más |
| Tools | `tools/registry.ts` | Definición tipada: nombre, descripción, Zod in/out, handler |
| Tools de escena | `tools/scene/*.ts` | Envoltorio sobre `SceneOperations` |
| Contexto | `context/scene-context.ts` | Resumen compacto de la escena, bajo demanda |
| Selección | `context/selection.ts` | Qué está seleccionado ahora mismo |
| Memoria | `memory/conversation.ts` | Historial con resumen automático |
| Agente | `agent/agent.ts` | Loop `plan → ejecutar → observar`, cancelable |
| Transacción | `transaction/history.ts` | N mutaciones → 1 paso de undo |
| Prompts | `prompts/architect.ts` | Prompt del sistema con vocabulario arquitectónico |

### `apps/editor`

| Pieza | Ruta |
|---|---|
| Ruta de API | `app/api/copilot/route.ts` |
| Panel | `components/copilot/copilot-panel.tsx` |
| Hook | `components/copilot/use-copilot.ts` |
| Mensajes | `components/copilot/message-list.tsx` |
| Composer | `components/copilot/composer.tsx` |
| Actividad | `components/copilot/tool-activity.tsx` |
| Puente de escena | `components/copilot/scene-operations.ts` |
| Pestaña | registrada en `app/page.tsx` vía `sidebarTabs` |

---

## Orden de trabajo

Cada punto es un commit.

1. `packages/ai` con el esqueleto y `AIProvider` + adaptador mock.
2. Adaptador OpenRouter con streaming y tool calling.
3. Registro de tools + los tools de lectura (`get_scene_summary`, `find_nodes`, `describe_node`).
4. Tools de escritura (`create_wall`, `create_room`, `add_door`, `add_window`, `place_item`,
   `update_node`, `delete_node`) sobre `SceneOperations`.
5. Scene context retrieval + contexto de selección.
6. Transacción de historial: N mutaciones → un `Ctrl+Z`.
7. Loop del agente con tope de pasos, cancelación y manejo de errores de tool.
8. Ruta `/api/copilot` con streaming SSE y ejecución de tools en el cliente.
9. Panel de chat integrado como pestaña del sidebar.
10. Estados de actividad de herramientas en la UI.
11. Tests de agente, tools, transacción y seguridad.
12. Actualizar `CLAUDE.md` y documentación de arquitectura.

---

## Criterios de aceptación

Se prueba a mano, en el editor, con una clave real:

- [ ] "Diseña una casa de 180 m² para un lote de 10 × 25 con 3 habitaciones y 2 baños"
      construye la escena y se ve construirse.
- [ ] "Mueve la cocina 1.5 metros a la derecha" mueve la cocina, no otra cosa.
- [ ] Con un muro seleccionado, "haz esto 20 cm más alto" afecta a ese muro.
- [ ] `Ctrl+Z` una sola vez revierte la operación completa del agente.
- [ ] Cancelar a mitad de una operación la detiene y no deja la escena corrupta.
- [ ] Un tool con argumentos inválidos devuelve error al agente, que se corrige o lo reporta.
- [ ] Sin `OPENROUTER_API_KEY`, la UI lo dice claro y no se rompe.
- [ ] `bun test`, `bun run check-types` y `bun run check` en verde.

---

## Fuera de alcance (va en fases posteriores)

- Imágenes y visión → fase 2.
- Autocorrección tras validar → fase 3.
- Alternativas de diseño y snapshots → fase 3.
- Memoria persistente entre sesiones → fase 4.
