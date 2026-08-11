# Snapshots y alternativas

## El problema

> "Dame tres distribuciones."

Pedir opciones solo sirve si pedirlas no te cuesta la que ya tenías. Un agente que genera la
alternativa B encima de la A ha destruido A, y el usuario se entera cuando ya es tarde.

## La red de seguridad

`restore_snapshot` **captura el estado actual antes de restaurar**:

```ts
const savedCurrent = capture({ label: `Before restoring "${target.label}"`, origin: 'auto' })
scene.loadJSON(target.graph)
```

Consecuencia: nunca se pierde nada, ni siquiera lo que no se había guardado a propósito.
Por eso `restore_snapshot` está marcada `risk: 'safe'` y no `destructive` — hacer confirmar
cada cambio de alternativa sería fricción sin protección, porque no hay nada que proteger.

Hay test: guardar base → construir B → restaurar base → restaurar el `savedCurrent` →
vuelve B.

## Tres orígenes

| Origen | De dónde viene | ¿Se le enseña al modelo? |
|---|---|---|
| `manual` | `save_snapshot` normal | Sí |
| `alternative` | `save_snapshot` con `isAlternative: true` | Sí |
| `auto` | La red de seguridad antes de restaurar | No |

`list_snapshots` filtra los `auto`. Si no, tres opciones pedidas se enterrarían bajo seis
que nadie pidió. El usuario sí los ve en la UI si los necesita.

## El flujo de alternativas

Lo conduce el prompt, no código:

```
1. save_snapshot          "Original layout"
2. construir la variante A
3. save_snapshot          "Central circulation", isAlternative: true
4. restore_snapshot       → vuelta al punto de partida
5. construir la variante B
6. save_snapshot          "Day/night zoning", isAlternative: true
7. restore_snapshot       → la que el usuario deba ver
```

Las etiquetas describen la **idea**, no el número: "Central circulation" le dice algo al
usuario, "Opción A" no.

## Clonado profundo, no por referencia

```ts
const graph = scene.exportSceneGraph()
```

`SceneBridge.exportSceneGraph()` devuelve una copia. Un snapshot que compartiera estructura
con la escena viva no sería un snapshot, y el fallo es invisible hasta que un restore no
hace nada. El `fake-scene` de los tests usa `structuredClone` por el mismo motivo, y hay un
test que lo comprueba explícitamente.

## Memoria, no disco

Los snapshots viven en memoria y se pierden al recargar. Deliberado para esta fase: son
alternativas de trabajo dentro de una sesión, no proyectos guardados.

Persistirlos es fase 4, y va por el `SceneStore` que ya existe en `packages/mcp/src/storage/`
— no por un segundo sistema de almacenamiento paralelo.

Hay un tope (`maxSnapshots`, 12 por defecto): un grafo de casa no es pequeño y doce copias
en memoria ya se notan. Se descarta el más antiguo, **nunca el que la escena está usando**.

## En la UI

`alternatives.tsx` es una tira sobre el composer:

```
◈ SAVED DESIGNS
✓ Central circulation          6 sp · 178.4 m²
↺ Day/night zoning             7 sp · 181.2 m²
↺ Original layout              5 sp · 165.0 m²
```

Cada una con sus espacios y su superficie, para comparar sin cambiar. Click restaura.

Al restaurar desde la UI se le dice al modelo, como hecho:

> The user switched the editor to the saved design "Day/night zoning". That is the current
> scene now.

Sin eso, su siguiente respuesta describiría un diseño que ya no está en pantalla.

## Relación con el undo

Restaurar pasa por `loadJSON`, que es una mutación como cualquier otra: entra en el
historial de Zundo y se deshace con `Ctrl+Z`.

## `generate_variants` del MCP

`packages/mcp/src/tools/variants/` ya trae generación de variantes por mutación
paramétrica. Es un camino distinto y complementario: aquello permuta geometría
automáticamente, esto guarda y recupera diseños que el agente construyó razonando.

Nada impide que una fase posterior use `generate_variants` para *proponer* las alternativas
y estos snapshots para *conservarlas*.
