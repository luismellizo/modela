# Contexto de escena y coste

## El problema

Una casa de 180 m² son unos 250 nodos. Serializada a JSON: ~120.000 tokens. Mandada en
cada mensaje de una conversación de veinte turnos: unos cuantos dólares por conversación,
y un modelo peor, porque la señal que importa queda enterrada bajo geometría.

Mandar la escena entera no es solo caro. Es que funciona peor.

## Qué se manda

Un inventario, no la escena. `buildSceneSummary` recorre el store y produce:

- niveles, con su nombre e índice;
- espacios, con área, ancho, fondo y centro;
- cuentas por tipo (muros, puertas, ventanas, mobiliario);
- límites del plano;
- la selección actual, resuelta a nombres y tipos.

`renderSceneSummary` lo pasa a prosa terca:

```
Scene: 9 space(s), 24 wall(s), 9 door(s), 14 window(s), 12 item(s).
Floor area 178.4 m². Units: metres.
Plan bounds: x 0..12.4, z 0..15.2.
Level "Ground floor" (level_a1b2) — 24 wall, 9 zone, 9 door, 14 window, 12 item
  · Main bedroom (zone_c3d4) 18.2 m², 4.2×4.33 m, centre [3.1, 4.2]
  · Kitchen (zone_e5f6) 14 m², 3.5×4 m, centre [8.2, 3]
  …
Currently selected: wall wall_g7h8. "this"/"that" refers to it.
```

Unos 400 tokens en lugar de 120.000. Prosa y no JSON porque el JSON equivalente cuesta
~40% más en tokens y el modelo lee esto igual de bien.

## El detalle se pide, no se precarga

Lo que el resumen no trae, el modelo lo consigue llamando:

| Herramienta | Devuelve |
|---|---|
| `get_scene_overview` | El inventario completo, estructurado |
| `find_nodes` | Lista filtrada, con dimensiones clave, sin geometría |
| `describe_node` | **Todo** de un nodo, más su ancestría e hijos |
| `get_selection` | Lo seleccionado, con propiedades completas |

Así, "haz la habitación principal más grande" cuesta un `describe_node` de un nodo, no un
volcado de la casa.

```
petición del usuario
        ↓
resumen (siempre, ~400 tokens)
        ↓
¿hace falta más?  ──no──► actuar
        │
        sí
        ↓
find_nodes / describe_node   ← solo lo que toca esta petición
        ↓
actuar
```

## Memoria conversacional

`packages/ai/src/memory/conversation.ts` aplica tres reglas:

1. **Recorte por turnos completos.** Se guardan los últimos 12 turnos. Nunca se corta entre
   una llamada a herramienta y su resultado — el modelo se quedaría mirando una llamada sin
   respuesta.

2. **Recibos.** Los resultados de herramienta de hace más de dos turnos se reducen a lo
   único que sigue importando: qué se llamó, si funcionó y qué ids salieron.

   ```json
   {"tool":"create_room","ok":true,"zoneId":"zone_c3d4","wallIds":["wall_1","wall_2"]}
   ```

3. **Truncado.** Un resultado reciente enorme se corta con una nota que le dice al modelo
   cómo pedir el resto con un filtro más estrecho.

## La escena manda

Hay dos memorias y no tienen el mismo rango:

| Fuente | Autoridad |
|---|---|
| Estado de la escena | **Siempre gana** |
| Memoria conversacional | Contexto |

El resumen se reconstruye desde el store en cada turno. Si el chat dice "tres habitaciones"
y la escena tiene cuatro, el prompt dice cuatro. Una afirmación vieja del chat no puede
sobrescribir la realidad.

## Contexto de selección

`readSelection()` lee `useViewer` **en el momento en que corre la herramienta**, no cuando
empezó el turno. Si el usuario hace clic en otra cosa a mitad de una operación larga, lo
hizo a propósito y el agente lo respeta.

Con algo seleccionado, el prompt lo dice explícitamente:

```
Currently selected: wall wall_g7h8. "this"/"that" refers to it.
```

Eso es lo que hace que "haz esto 20 cm más alto" funcione sin decir qué es "esto".

## Presupuesto de herramientas

Cada herramienta expuesta gasta tokens en cada petición. El servidor MCP ofrece ~45; el
copiloto expone ~17 elegidas. Añadir una tiene que ganarse su sitio.

| Qué se manda | Coste aproximado por mensaje |
|---|---|
| Prompt del sistema | ~700 tokens |
| Resumen de escena | ~400 tokens |
| Schemas de 17 herramientas | ~2.500 tokens |
| Historial recortado | variable, con tope |
