# Relación con MCP

## Lo que ya existía

Pascal trae `packages/mcp`: un servidor MCP completo con ~45 herramientas, recursos,
prompts y almacenamiento SQLite, pensado para hosts externos (Claude Desktop, Claude Code)
que manejan una escena headless.

Modela **no lo reemplaza**. Lo reutiliza por donde importa.

## La pieza compartida

```
                    SceneOperations
                    (packages/mcp/src/operations/)
                          │
            ┌─────────────┴─────────────┐
            │                           │
   Servidor MCP                   Copiloto Modela
   ~45 herramientas               ~17 herramientas
   hosts externos                 dentro del editor
```

`SceneOperations` es la fachada de dominio. Los tools MCP ya estaban escritos contra ella,
así que el copiloto se enchufó ahí sin tocar nada: una implementación, dos puertas.

`SceneBridge` habla directamente con el store `useScene` de `@pascal-app/core`. En el
navegador, eso es la escena viva que el usuario está mirando. En el servidor MCP, es una
escena headless respaldada por SQLite. Mismo código, distinto sitio.

## Por qué el copiloto no usa las 45

Se evaluó ejecutar el servidor MCP dentro del navegador con un transporte en memoria, lo
que habría dado las 45 herramientas gratis. Se descartó por una razón concreta:

**Cada schema de herramienta viaja en cada petición al modelo.** Las 45 son unos 9.000
tokens por mensaje, permanentemente. Y buena parte no aplica a una conversación
arquitectónica dentro del editor (gestión de escenas guardadas, exportaciones, ciclo de
vida de proyectos).

Las ~17 del copiloto están elegidas para la conversación y descritas para ella. Ver
[`contexto.md`](contexto.md).

## Lo que sí se reutiliza literalmente

| Del paquete MCP | Dónde |
|---|---|
| `SceneOperations` | Interfaz que consumen todas las herramientas del copiloto |
| `SceneBridge` | Instanciado en `apps/editor/components/copilot/scene-operations.ts` |
| `tools/geometry` | `wallLength`, `wallLocalXFromT`, `polygonArea`, `polygonBounds` |
| `tools/asset-catalog` | `searchCatalogItems`, `findCatalogItem` para el mobiliario |
| Convenciones de nodos | Puertas y ventanas hijas del muro, posición local en metros |

Los dos últimos subpaths se añadieron al `exports` de `packages/mcp/package.json`. Es un
cambio aditivo: no rompe nada y mantiene el merge con upstream limpio.

## Consistencia entre las dos puertas

Una habitación creada por el copiloto y una creada por Claude Desktop a través del MCP son
el mismo grafo: zona + losa + techo + un muro por arista. Eso no es coincidencia, es que
ambos caminos construyen los mismos nodos con los mismos schemas de `@pascal-app/core`.

Si cambias una convención en un lado, cámbiala en el otro. Los tests de `packages/mcp` y los
de `packages/ai` cubren cada uno el suyo.

## Seguir usando MCP desde fuera

El servidor sigue intacto:

```bash
bunx @pascal-app/mcp        # stdio, para Claude Desktop
```

Las herramientas de visión de MCP (`analyze_floorplan_image`, `analyze_room_photo`) delegan
en la capacidad de *sampling* del host: el paquete MCP no lleva modelo dentro. El copiloto
de Modela sí tiene proveedor propio, así que usa su propia ruta de visión
([`imagenes.md`](imagenes.md)). Las dos existen y no compiten: cubren hosts distintos.
