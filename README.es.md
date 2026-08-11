<div align="center">

# Modela

**Un editor arquitectónico 3D con una IA que de verdad maneja el CAD.**

Describe una casa en lenguaje natural, suelta la foto de un plano, o señala lo que hay en
pantalla — el agente inspecciona la escena, planifica y la construye. Un solo `Ctrl+Z` lo
revierte todo.

[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
[![Basado en Pascal Editor](https://img.shields.io/badge/basado%20en-Pascal%20Editor-6b7280.svg)](https://github.com/pascalorg/editor)

[English](README.md) · [Arquitectura](docs/arquitectura/) · [Planes](docs/planes/)

</div>

---

## Qué es

Casi todo lo que se vende como "IA en CAD" es un panel de chat que escribe texto al lado de
un visor 3D. Modela es la otra cosa: el modelo tiene herramientas tipadas y validadas
conectadas al scene graph, así que una frase se convierte en geometría.

```
> Diseña una casa de 180 m² para un lote de 10 × 25 m: 3 habitaciones,
  2 baños, cocina abierta, sala-comedor, garaje para dos carros y terraza.

  ✓ Analizando requisitos
  ✓ Distribuyendo espacios
  ✓ Construyendo paredes     24 muros
  ✓ Añadiendo puertas         9 puertas
  ✓ Añadiendo ventanas       14 ventanas
  ✓ Validando distribución   sin incidencias

  Listo — 178.4 m² en 9 espacios.

> Haz la habitación principal más grande.
> Mueve la cocina 1.5 m hacia la derecha.
> [suelta la foto de un plano] Recréalo en 3D.
```

Todo eso se ejecuta contra la escena viva. Nada está simulado.

## Por qué está construido así

| Decisión | Motivo |
|---|---|
| Las herramientas corren **en el navegador**, contra la escena viva | Ves aparecer los muros mientras el agente trabaja, y el undo nativo sigue funcionando |
| El LLM se llama **desde el servidor** | La clave de API nunca llega a un bundle del cliente |
| El agente habla con `SceneOperations`, nunca con React | La lógica de dominio queda testeable y la UI reemplazable |
| Un turno de IA colapsa en **un** paso de historial | `Ctrl+Z` significa "deshaz lo que hizo la IA", no "deshaz una de 40 mutaciones" |
| El proveedor es una interfaz, no una dependencia | Cambiar de modelo o de vendor sin tocar el agente |
| La visión separa `observed` / `inferred` / `unknown` | El modelo nunca se inventa en silencio una cota que no pudo ver |

## Arquitectura

```
                        USUARIO
                 texto ────┴──── imagen
                           ↓
                  ┌────────────────┐
                  │ Panel copiloto │   apps/editor/components/copilot
                  └────────┬───────┘
                           ↓
                   /api/copilot          servidor — aquí vive la clave
                           ↓
        ┌──────────────────────────────────────┐
        │            packages/ai               │   sin React, sin DOM
        │  provider · agent · context · tools  │
        │  memory  · transaction · validation  │
        └──────────────────┬───────────────────┘
                           ↓
                    SceneOperations              packages/mcp — se reutiliza tal cual
                           ↓
                      SceneBridge
                           ↓
                     SCENE GRAPH                 packages/core
                           ↓
                     VISTA 2D / 3D               packages/viewer
```

La misma fachada `SceneOperations` sirve al copiloto interno y al servidor MCP, así que los
hosts externos (Claude Desktop, Claude Code) manejan exactamente los mismos ~45 tools. Una
implementación, dos puertas de entrada.

## Arranque rápido

Necesitas [Bun](https://bun.sh) 1.3+ y Node 20+.

```bash
git clone https://github.com/luismellizo/modela.git
cd modela
./start.sh                     # comprueba el entorno, instala y arranca
```

Crea `.env.local` desde el ejemplo en la primera ejecución y te dice qué falta.
Pon una [clave de OpenRouter](https://openrouter.ai/keys) y vuelve a ejecutarlo.

Con `MODELA_AI_FREE_ONLY=1` el panel solo ofrece modelos gratis con tool calling, y el
servidor rechaza cualquier otro — el selector es comodidad, el límite lo pone el servidor.

El editor arranca sin clave de API — simplemente no tienes copiloto.

### Variables de entorno

| Variable | Requerida | Por defecto | Para qué |
|---|---|---|---|
| `OPENROUTER_API_KEY` | para la IA | — | Clave de [openrouter.ai/keys](https://openrouter.ai/keys) |
| `MODELA_AI_PROVIDER` | no | `openrouter` | `openrouter` o `mock` |
| `MODELA_AI_MODEL` | no | ver `.env.example` | Modelo inicial; el selector del panel lo sobrescribe |
| `MODELA_AI_FREE_ONLY` | no | apagado | `1` limita a modelos gratis — **lo valida el servidor** |
| `MODELA_AI_MAX_STEPS` | no | `24` | Tope de iteraciones del agent loop |
| `PORT` | no | `3002` | Puerto del servidor de desarrollo |

## Cómo extenderlo

**Añadir un proveedor de IA** — implementa `AIProvider` en `packages/ai/src/provider/` y
regístralo en `registry.ts`. No cambia nada más.

**Añadir una herramienta** — defínela con `defineTool()` (nombre, descripción, Zod de entrada,
Zod de salida, handler sobre `SceneOperations`) y regístrala. La validación de schema y el
manejo de errores vienen de serie.

**Cambiar la marca** — todo lo visible vive en `packages/brand/`. Nombre, colores, logo,
favicon, textos, URLs, metadata. Un solo archivo.

Guías completas en [`docs/arquitectura/`](docs/arquitectura/).

## Estructura

```
apps/editor              App Next.js — compone visor, editor y copiloto
packages/core            Scene graph, schemas Zod, store Zustand, historial
packages/viewer          Canvas 3D (React Three Fiber)
packages/editor          UI de edición — paneles, herramientas, selección
packages/nodes           Definiciones de nodos: muro, ventana, zona, escalera, cubierta…
packages/mcp             Servidor MCP, SceneBridge, SceneOperations, almacenamiento
packages/ai              ★ Proveedor, agente, tools, contexto, memoria, transacciones
packages/brand           ★ Configuración de marca
docs/planes              Hoja de ruta fase a fase
docs/arquitectura        Documentación técnica de la capa de IA
```

★ = añadido por Modela. El resto es Pascal upstream, intacto y mergeable.

## Comandos

```bash
bun dev                  # servidor de desarrollo
bun test                 # tests de todos los paquetes
bun run check-types      # typecheck
bun run check            # lint + formato
bun run check:fix        # corregir lo corregible
bun run build            # build de producción
```

## Hoja de ruta

| Fase | Qué entra | Estado |
|---|---|---|
| 0 | Fork, capa de marca, docs, reglas | ✅ |
| 1 | Chat nativo, abstracción de proveedor, tools de escena, undo único | ✅ |
| 2 | Adjuntos de imagen, visión, plano → escena | ✅ |
| 3 | Agent loop, reglas de validación, autocorrección, alternativas | 🚧 |
| 4 | Memoria de proyecto, base de conocimiento, optimización de distribución | 🚧 |

Detalle en [`docs/planes/`](docs/planes/).

## Licencia

MIT — ver [`LICENSE`](LICENSE).

Modela es un fork de [**Pascal Editor**](https://github.com/pascalorg/editor) de Pascal Group Inc.,
también bajo MIT. El editor 3D, el scene graph, el sistema de nodos y el servidor MCP son obra
suya; su aviso de copyright se conserva en `LICENSE` junto al nuestro, como exige la licencia.
La capa de arquitectura con IA (`packages/ai`, la UI del copiloto, la capa de marca) es de Modela.

Si lo que quieres es el editor sin la capa de IA, usa Pascal directamente — es excelente.

---

<div align="center">
Hecho por <a href="https://github.com/luismellizo">Luis Mellizo</a> · Bucaramanga, Colombia
</div>
