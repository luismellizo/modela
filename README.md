<div align="center">

# Modela

**An architectural 3D editor with an AI that actually operates the CAD.**

Describe a house in plain language, drop in a floor plan photo, or point at what's on screen —
the agent inspects the scene, plans, and builds it. One `Ctrl+Z` undoes the whole thing.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Built on Pascal Editor](https://img.shields.io/badge/built%20on-Pascal%20Editor-6b7280.svg)](https://github.com/pascalorg/editor)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![React Three Fiber](https://img.shields.io/badge/React%20Three%20Fiber-9-000.svg)](https://docs.pmnd.rs/react-three-fiber)

[Español](README.es.md) · [Architecture](docs/arquitectura/) · [Roadmap](docs/planes/)

</div>

---

## What this is

Most "AI in CAD" is a chat panel that writes text next to a 3D viewport. Modela is the other
thing: the model holds typed, validated tools wired straight into the scene graph, so a
sentence turns into geometry.

```
> Design a 180 m² house on a 10 × 25 m lot: 3 bedrooms, 2 baths,
  open kitchen, living-dining, 2-car garage, terrace.

  ✓ Analyzing requirements
  ✓ Laying out spaces
  ✓ Building walls          24 walls
  ✓ Adding doors            9 doors
  ✓ Adding windows          14 windows
  ✓ Validating layout       no issues

  Done — 178.4 m² across 9 spaces.

> Make the main bedroom bigger.
> Move the kitchen 1.5 m to the right.
> [drops a floor plan photo] Recreate this in 3D.
```

Every one of those runs against the live scene. Nothing is mocked.

## Why it's built this way

| Decision | Reason |
|---|---|
| Tools run **in the browser**, against the live scene | You watch walls appear as the agent works, and native undo keeps working |
| The LLM is called **from the server** | The API key never reaches a client bundle |
| The agent talks to `SceneOperations`, never to React | Domain logic stays testable and the UI stays replaceable |
| One AI turn collapses to **one** history step | `Ctrl+Z` means "undo what the AI just did", not "undo one of 40 mutations" |
| The provider is an interface, not a dependency | Swap models or vendors without touching the agent |
| Vision output is split into `observed` / `inferred` / `unknown` | The model never quietly invents a dimension it couldn't see |

## Architecture

```
                          USER
                  text ────┴──── image
                           ↓
                  ┌────────────────┐
                  │  Copilot panel │   apps/editor/components/copilot
                  └────────┬───────┘
                           ↓
                   /api/copilot          server — holds the API key
                           ↓
        ┌──────────────────────────────────────┐
        │            packages/ai               │   no React, no DOM
        │  provider · agent · context · tools  │
        │  memory  · transaction · validation  │
        └──────────────────┬───────────────────┘
                           ↓
                    SceneOperations              packages/mcp — reused as-is
                           ↓
                      SceneBridge
                           ↓
                     SCENE GRAPH                 packages/core
                           ↓
                      2D / 3D VIEW                packages/viewer
```

The same `SceneOperations` façade backs both the in-editor copilot and the MCP server, so
external hosts (Claude Desktop, Claude Code) drive the exact same ~45 tools. One
implementation, two front doors.

## Quick start

Requires [Bun](https://bun.sh) 1.3+ and Node 20+.

```bash
git clone https://github.com/luismellizo/modela.git
cd modela
./start.sh                     # checks the environment, installs, runs
```

It creates `.env.local` from the example on first run and tells you what is missing.
Add an [OpenRouter key](https://openrouter.ai/keys) and run it again.

With `MODELA_AI_FREE_ONLY=1` the panel offers only free models that can call tools, and the
server refuses anything else — the picker is a convenience, the server is the limit.

The editor runs without an API key — you just don't get the copilot.

### Environment

| Variable | Required | Default | What it does |
|---|---|---|---|
| `OPENROUTER_API_KEY` | for AI | — | Key from [openrouter.ai/keys](https://openrouter.ai/keys) |
| `MODELA_AI_PROVIDER` | no | `openrouter` | `openrouter` or `mock` |
| `MODELA_AI_MODEL` | no | see `.env.example` | Starting model; the panel picker overrides it |
| `MODELA_AI_FREE_ONLY` | no | off | `1` restricts to free models — **enforced server-side** |
| `MODELA_AI_MAX_STEPS` | no | `24` | Cap on agent loop iterations |
| `PORT` | no | `3002` | Dev server port |

## Extending it

**Add an AI provider** — implement `AIProvider` in `packages/ai/src/provider/`, register it in
`registry.ts`. Nothing else changes.

**Add a tool** — define it with `defineTool()` (name, description, Zod input, Zod output,
handler over `SceneOperations`) and register it. Schema validation and error handling come
for free.

**Rebrand it** — everything user-facing lives in `packages/brand/`. Name, colors, logo,
favicon, copy, URLs, metadata. One file.

Full guides in [`docs/arquitectura/`](docs/arquitectura/).

## Repository layout

```
apps/editor              Next.js app — composes the viewer, editor and copilot
packages/core            Scene graph, Zod schemas, Zustand store, history
packages/viewer          3D canvas (React Three Fiber)
packages/editor          Editing UI — panels, tools, selection
packages/nodes           Node definitions: wall, window, zone, stair, roof…
packages/mcp             MCP server, SceneBridge, SceneOperations, storage
packages/ai              ★ Provider, agent, tools, context, memory, transactions
packages/brand           ★ Brand configuration
docs/planes              Phase-by-phase roadmap
docs/arquitectura        Technical docs for the AI layer
```

★ = added by Modela. Everything else is upstream Pascal, kept intact and mergeable.

## Commands

```bash
bun dev                  # dev server
bun test                 # tests across all packages
bun run check-types      # typecheck
bun run check            # lint + format check
bun run check:fix        # fix what's fixable
bun run build            # production build
```

## Roadmap

| Phase | What lands | Status |
|---|---|---|
| 0 | Fork, brand layer, docs, rules | ✅ |
| 1 | Native chat, provider abstraction, scene tools, single-step undo | ✅ |
| 2 | Image attachments, vision, floor plan → scene | ✅ |
| 3 | Agent loop, validation rules, self-correction, alternatives | 🚧 |
| 4 | Project memory, architectural knowledge base, layout optimization | 🚧 |

Details in [`docs/planes/`](docs/planes/).

## License

MIT — see [`LICENSE`](LICENSE).

Modela is a fork of [**Pascal Editor**](https://github.com/pascalorg/editor) by Pascal Group Inc.,
also MIT licensed. The 3D editor, scene graph, node system and MCP server are their work; the
copyright notice is preserved in `LICENSE` alongside ours, as the license requires. The AI
architecture layer (`packages/ai`, the copilot UI, the brand layer) is Modela's.

If you want the editor without the AI layer, go use Pascal directly — it's excellent.

---

<div align="center">
Built by <a href="https://github.com/luismellizo">Luis Mellizo</a> · Bucaramanga, Colombia
</div>
