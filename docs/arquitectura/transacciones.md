# Transacciones y undo

## Qué se espera

> "Agranda la habitación principal y mueve el baño."

Eso son, por dentro, unas quince mutaciones. Si `Ctrl+Z` deshace una de las quince, el
usuario tiene que pulsarlo quince veces y adivinar dónde parar. Un turno del agente es una
sola decisión del usuario, así que tiene que ser un solo paso de historial.

## Lo que ya trae el core

`packages/core/src/store/history-control.ts` exporta:

```ts
export function runAsSingleSceneHistoryStep<TPastState, TResult>(
  sceneStore: TemporalHistoryStoreLike<TPastState>,
  run: () => TResult,
): TResult
```

Hace exactamente esto… pero el callback es **síncrono**. Lee el historial, ejecuta y
colapsa en un mismo tick.

Un turno del agente es asíncrono por definición: entre cada par de herramientas hay una
llamada al modelo que tarda segundos. No cabe dentro de una función síncrona.

## Lo que hace Modela

`packages/ai/src/transaction/history.ts` parte el mismo trabajo en dos momentos:

```ts
const transaction = beginSceneTransaction(store)   // al empezar el turno
// … mutaciones asíncronas, muchas, con llamadas al modelo entre medias …
transaction.commit()                                // al terminar
```

La aritmética del colapso es idéntica a la del core, incluida `retainedPastStateCount`.
Lo que cambia es cuándo se ejecuta.

### El colapso

```
antes    [a, b]
después  [a, b, s1, s2, s3, s4]
              └──────────────┘  4 estados añadidos
colapsa  [a, b, s1]
```

Se conserva **el primero** de los añadidos, no el último. Ese primero es el estado
inmediatamente anterior a la primera mutación del turno, así que deshacerlo vuelve
exactamente a donde estaba antes de hablar con la IA.

### La truncación

Zundo tiene un límite de historial. Cuando lo alcanza, tira estados por delante:

```
antes    [a, b, c]
después  [b, c, s1, s2]     ← 'a' desapareció
```

Comparar longitudes daría un resultado equivocado. Por eso `retainedPastStateCount`
compara por identidad de referencia y encuentra cuánto del historial original sigue ahí.
Está cubierto por test (`history.test.ts`, "detects front truncation").

## Cuándo se abre

Perezosamente, en la primera herramienta de escritura:

```ts
if (definition?.kind === 'write' && !transaction && deps.historyStore) {
  transaction = beginSceneTransaction(deps.historyStore)
}
```

Un turno que solo lee ("¿qué problemas tiene esta distribución?") no toca el historial.
Sin esto, preguntar cosas ensuciaría la pila de undo.

## Cuándo se cierra

Siempre, en `finish()`, pase lo que pase: éxito, cancelación, error de proveedor o tope de
pasos. Un turno interrumpido a la mitad deja obra construida, y esa obra parcial también
tiene que deshacerse de un tirón.

## Dos formas de deshacer

1. `Ctrl+Z` normal del editor. Un turno de IA es una entrada como cualquier otra.
2. El botón "Undo these changes" bajo el mensaje, que llama a `SceneOperations.undo(1)`.

Las dos hacen lo mismo. La segunda existe porque es más descubrible justo después de que
la IA construya algo.

## Límites

- **No hay rollback automático si el turno falla.** Deliberado: un turno que construyó tres
  habitaciones de cuatro suele ser útil. El usuario decide, con un solo `Ctrl+Z` disponible.
- **La transacción no cruza turnos.** Dos mensajes son dos pasos de undo, porque son dos
  decisiones del usuario.
- **Sin `historyStore` inyectado**, el agente sigue funcionando; cada mutación es su propia
  entrada de historial. Esa es la ruta que usan los tests que no montan el store.
