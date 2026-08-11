# Propuestas y confirmación

## El equilibrio

Pedir permiso para mover una silla es fricción. No pedirlo para regenerar una casa entera
sobre otra que ya existe es destruir trabajo sin avisar. El sistema tiene que distinguir
las dos cosas.

| Situación | Qué pasa |
|---|---|
| Edición pequeña y reversible | Se ejecuta. El turno entero es un solo undo |
| Más de ~6 pasos | El agente propone y espera |
| Borra o reemplaza trabajo existente | El agente propone y espera |
| Generación completa sobre escena no vacía | El agente propone y espera |
| `delete_node` suelto | Se rechaza hasta que el usuario aprueba |

## Por qué el plan lleva las llamadas dentro

El diseño obvio sería: el agente describe el plan en texto, el usuario dice "sí", y el
agente vuelve a llamar al modelo para construirlo.

Eso tiene un fallo que anula el propósito de revisar: **lo que se ejecuta no es lo que se
revisó**. El segundo pase puede planificar algo distinto — otro tamaño, otro orden, otra
habitación — y el usuario ya dijo que sí a otra cosa.

Por eso `propose_plan` transporta las llamadas reales:

```ts
{
  title: '180 m² house',
  summary: 'Three bedrooms, two baths, open kitchen.',
  calls: [
    { tool: 'create_room', arguments: { name: 'Main bedroom', polygon: [...] },
      label: 'Main bedroom — 4.2 × 4.3 m (18.2 m²)' },
    …
  ],
  warnings: ['Ceiling height assumed at 2.60 m'],
}
```

Aprobar ejecuta **esas** llamadas. Sin llamada al modelo, sin replanificación, sin
divergencia. Y sale gratis y al instante.

## Validación antes de enseñar

`propose_plan` valida cada llamada contra el schema de su herramienta antes de que el plan
llegue a pantalla, usando `ToolRegistry.validate()` — el mismo registro que luego lo
ejecuta.

Si algo no valida, el plan no se muestra: el error vuelve al modelo con el índice y el
motivo.

```
calls[1] (not_a_tool): No tool named "not_a_tool"
```

Un botón "Aplicar cambios" que falla a la mitad es peor que no tener botón.

## El bucle para de verdad

El prompt le pide al modelo que se detenga tras proponer. Pero **un prompt no es un
control**. El bucle lo impone:

```ts
if (pendingProposal) {
  return finish('awaiting-approval')
}
```

Hay un test que lo comprueba con un modelo que intenta seguir construyendo después de
proponer (`proposal.test.ts`, "the loop stops even if the model tries to keep building").
La escena queda vacía.

## Aplicar

`applyProposal()` recorre las llamadas, las ejecuta por el registro y emite **los mismos
eventos que un turno normal**. La UI reutiliza el mismo renderizador de actividad: el
usuario ve correr los pasos que acaba de leer.

Detalles que importan:

- **Un solo undo.** Abre transacción, la cierra al final.
- **Aprobar el plan aprueba sus pasos destructivos.** `applyProposal` construye su propio
  registro con `confirmed = new Set(calls.map(c => c.tool))`. Recibe las definiciones de
  herramientas, no un registro ya montado, precisamente para que no exista la variante rota
  donde un borrado aprobado se rechaza igual.
- **Un paso que falla no tira los buenos.** Un plan suele ser una lista de habitaciones
  independientes, no una cadena. Se sigue y se reporta `partial` con los fallos.
- **El modelo se entera.** Tras aplicar o descartar, se añade a la memoria qué pasó
  realmente. Sin eso, su siguiente respuesta describiría una escena que no existe.

## Confirmación de herramientas destructivas

Camino distinto, más corto. `delete_node` está marcada `risk: 'destructive'`. El registro
la rechaza con `needs_confirmation` salvo que su nombre esté en el set `confirmed`.

```
modelo llama delete_node
      ↓
registro: needs_confirmation
      ↓
evento needs-confirmation → tarjeta en la UI
      ↓
[Approve] → confirmTool + reenvío del turno
[No]      → se anota en memoria: no reintentar
```

La aprobación **dura un turno**. `confirmedRef` se vacía en el `finally` de cada envío:
aprobar un borrado no autoriza todos los borrados de la sesión.

## Umbrales

`DEFAULT_PROPOSAL_THRESHOLDS.maxDirectCalls = 6` está expuesto para cuando la decisión se
automatice. Hoy el criterio vive en el prompt, no en código: el modelo decide si propone.

Es una elección consciente para esta fase — juzgar "esto es grande" requiere entender la
intención, no contar llamadas. La fase 3 puede endurecerlo si en la práctica el modelo
propone poco.
