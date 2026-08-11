# Puntuación y optimización de distribución

El paso de **dibujar** a **diseñar**: no "¿esto es válido?" sino "¿esto es bueno, y mejor que
lo otro?".

---

## La advertencia va primero

Todo lo que hay aquí son **heurísticas leídas del grafo**. Cuentan ventanas, miden
distancias, suman áreas. No hay simulación de luz, ni térmica, ni base de costes.

Un número con dos decimales invita a dejar de cuestionarlo, así que:

- cada objetivo declara en su `basis` qué mide **y qué no**;
- `scoreLayout` devuelve un `disclaimer` que la herramienta reenvía;
- el prompt le exige al agente repetirlo cuando cite una puntuación.

> "Sirven para comparar opciones, no para declarar un diseño objetivamente bueno."

---

## Seis objetivos

| Objetivo | Peso | Qué mide |
|---|---|---|
| `target-areas` | 1.2 | Cada espacio contra su tamaño cómodo convencional (usa la base de conocimiento) |
| `daylight` | 1.3 | Ventanas en espacios habitables + cuántas dan al lado soleado |
| `circulation` | 1.0 | Proporción de superficie dedicada a pasillos. 8–15% es lo típico |
| `compactness` | 0.8 | Cuánto llena la planta su rectángulo envolvente |
| `day-night-zoning` | 1.0 | Distancia entre el centroide de dormir y el de estar |
| `adjacency` | 1.0 | Cocina↔comedor, dormitorio↔baño |

Cada uno devuelve 0..1 **y una frase con el porqué**:

```
daylight 0.62 — "3 of 5 habitable space(s) have windows; 2 face south
                 (the sunny side in the northern hemisphere)"
improvement    — "Add windows to Bedroom 2, Kitchen."
```

Una puntuación sin explicación es un número que hay que creerse. "Tu distribución saca 0,62"
no ayuda a nadie.

### `applicable: false`

Un nivel vacío no debe sacar cero en iluminación: debe quedar **excluido**. Los objetivos que
no tienen nada que medir se marcan no aplicables y salen del promedio ponderado.

---

## La parte más blanda: clasificar espacios

El scene graph no sabe qué es un dormitorio. Una zona es un polígono con una etiqueta. Así
que el tipo se infiere **del nombre**, en español e inglés.

Es la pieza menos sólida de toda la capa, y por eso:

- lo que no reconoce es `other`, y los objetivos que dependen del tipo lo ignoran en vez de
  adivinar;
- los nombres combinados van **primero** en la lista.

Ese último punto salió de un test que falló. `"Sala-comedor"` hace match con `living` y con
`dining`, y ganaba el que estuviera antes en la lista — por accidente. Ahora hay un patrón
explícito para nombres combinados que lo resuelve como `living` (para que se mida contra el
área mayor), y `adjacency` acepta un `living` como extremo del par cocina→comedor cuando no
hay comedor separado. Sin esa segunda mitad, la distribución más común del mundo se saltaba
el objetivo en silencio.

---

## Orientación

`facingOf` deduce hacia dónde mira una ventana con la normal exterior de su muro respecto al
centroide del edificio.

**El grafo no tiene brújula.** "Norte" aquí significa −Z en planta. El prompt le pide al
agente confirmar la orientación real con el usuario en vez de tratar esto como dato
levantado en campo. El hemisferio invierte qué fachada es la soleada y es un parámetro
explícito.

---

## Comparar

```
compare_layouts({ snapshotIds: ['snap_a', 'snap_b', 'snap_c'] })
```

Restaura cada snapshot, lo puntúa, y **deja al usuario donde estaba** —captura antes, y
restaura en un `finally`—.

Puntuar un grafo guardado sin cargarlo habría necesitado una segunda implementación de
escena, y dos implementaciones de lo mismo divergen.

El veredicto nombra los objetivos que de verdad separaron a los dos primeros:

```
"Central circulation" leads on daylight (4 of 5 habitable spaces have windows)
and target-areas, but "Day/night zoning" is better on circulation — worth
weighing if that matters more here.
```

Y cuando empatan, lo dice:

> "Puntúan casi idéntico. Elige por razones que esto no puede medir — cómo se sienten, cómo
> se construyen."

Un ranking sin razones deja al usuario con una tabla de posiciones y ninguna decisión.

---

## La búsqueda la conduce el agente

No hay optimizador automático que permute geometría. El bucle es:

```
save_snapshot         → punto de partida
construir variante A  → save_snapshot
restore_snapshot      → volver
construir variante B  → save_snapshot
compare_layouts       → puntuar y rankear
restore_snapshot      → dejar la ganadora
```

El modelo decide **qué** variar; la puntuación decide cuál gana. Esa división es deliberada:
generar distribuciones plausibles es donde el modelo es fuerte, y evaluarlas de forma
consistente es donde no lo es.

`generate_variants` de `packages/mcp` permuta geometría automáticamente y encaja aquí como
generador alternativo. Está pendiente de conectar.

---

## Pesos

`scoreLayout({ weights: { daylight: 3 } })` reponderar sin tocar los objetivos. Hoy no está
expuesto en la UI; el sitio natural sería dejar que el usuario diga qué le importa —
"prioriza luz natural sobre superficie"— y traducirlo a pesos.

---

## Añadir un objetivo

```ts
export const miObjetivo: Objective = {
  id: 'acoustic-separation',
  label: 'Acoustic separation',
  defaultWeight: 0.9,
  basis: 'Distance from bedrooms to the garage and laundry. Not an acoustic calculation',
  evaluate({ spaces }) {
    if (/* nada que medir */) return { id: 'acoustic-separation', score: 0, applicable: false, reason: '…' }
    return { id: '…', score, applicable: true, reason: '…', improvement: '…' }
  },
}
```

Añadirlo a `DEFAULT_OBJECTIVES`, ampliar `ObjectiveId`, y escribir su test. El `basis` tiene
que decir qué **no** mide: es la parte que evita que un número heurístico se lea como un
resultado de ingeniería.
