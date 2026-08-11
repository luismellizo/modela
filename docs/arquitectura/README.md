# Arquitectura de la capa de IA

Documentación técnica del copiloto. El editor 3D es de Pascal y está documentado en
[`wiki/architecture/`](../../wiki/architecture/); esto cubre solo lo que añade Modela.

| Documento | Responde a |
|---|---|
| [`copiloto.md`](copiloto.md) | Cómo funciona el agente y por qué está partido así |
| [`proveedores.md`](proveedores.md) | Cómo añadir un proveedor de IA nuevo |
| [`herramientas.md`](herramientas.md) | Cómo añadir una herramienta |
| [`contexto.md`](contexto.md) | Qué ve el modelo de la escena y cuánto cuesta |
| [`transacciones.md`](transacciones.md) | Por qué un turno completo se deshace con un `Ctrl+Z` |
| [`imagenes.md`](imagenes.md) | Cómo se leen las imágenes y cómo añadir tipos nuevos |
| [`mcp.md`](mcp.md) | Relación con el servidor MCP existente |
| [`configuracion.md`](configuracion.md) | Variables de entorno, ejecución local y testing |

## Mapa de una frase

```
Panel (React)  →  hook  →  agente  →  proveedor HTTP  →  /api/copilot  →  OpenRouter
                             │
                             └→  herramientas  →  SceneOperations  →  SceneBridge  →  useScene
```

El modelo se llama desde el servidor; las herramientas se ejecutan en el navegador.
Ese reparto es la decisión central y está explicada en [`copiloto.md`](copiloto.md).
