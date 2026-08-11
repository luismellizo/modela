# Memoria de proyecto y base de conocimiento

Dos piezas distintas que se apoyan entre sí: una sabe qué necesita **este** proyecto, la
otra qué necesitan los proyectos en general. Juntas, el agente deja de inventarse cotas y
deja de olvidar lo que le dijeron la semana pasada.

---

## Memoria de proyecto

### Tres fuentes, tres rangos

| Fuente | Qué guarda | Autoridad |
|---|---|---|
| **Escena** | Lo que existe de verdad | **Siempre gana** |
| **Memoria de proyecto** | El encargo: presupuesto, estilo, restricciones, decisiones | Contexto |
| **Conversación** | Lo dicho en esta sesión | La más débil |

La escena se reconstruye en el prompt en cada turno, así que no puede quedarse rancia. La
conversación se recorta y acaba olvidándose. Esta capa es lo que sobrevive en medio.

Si el encargo dice tres habitaciones y la escena tiene cuatro, **manda la escena** y el
agente lo dice en voz alta en vez de elegir una en silencio. Está en el prompt del sistema.

### Lo que no guarda

Geometría. "Tres habitaciones" vive aquí solo como **objetivo**; cuántas hay es una pregunta
para la escena. Guardar el estado en dos sitios es garantizar que se contradigan.

### Estructura

```ts
{
  key: 'lot-size',              // re-usar la clave la reemplaza
  value: '10 × 25 m',
  category: 'constraint',       // brief · constraint · preference · decision
  source: 'user',               // o 'inferred'
}
```

**Re-usar una clave reemplaza.** Un encargo que acumula contradicciones es peor que no tener
encargo.

**`source: 'inferred'` se marca en el prompt**: "(your assumption, not stated)". El agente
tiene que poder distinguir lo que le dijeron de lo que dedujo, o acaba defendiendo sus
propias suposiciones como si fueran requisitos del cliente.

### Persistencia

`localStorage`, vía `createWebStorage`. Vive en `packages/ai` porque es Web Storage puro
—sin React, sin DOM— y mantiene el formato de serialización en un solo sitio.

Degrada en silencio: storage corrupto → encargo vacío; cuota excedida → sigue funcionando en
memoria. Ninguna de las dos cosas debería tumbar una sesión.

Tope de 40 hechos. Al superarlo se descartan **primero los `inferred`**, y solo después los
más antiguos que dijo el usuario.

### Herramientas

`remember_project_fact` · `get_project_brief` · `forget_project_fact`

---

## Base de conocimiento

### Qué es y qué no

**Es**: rangos dimensionales convencionales que un arquitecto lleva en la cabeza. Sirve
porque un modelo al que le pides "un dormitorio cómodo" elige un número sin ningún criterio
detrás.

**No es**: cumplimiento normativo. Son convenciones, no regulación. Cada entrada lleva su
`basis`, y las que tocan materia regulada —alturas, escaleras, superficie de ventana— lo
dicen explícitamente:

```ts
basis: 'Common residential practice; not a code requirement.
        Minimum heights are regulated in most jurisdictions'
```

Hay un test que lo verifica: si alguien añade una entrada sobre escaleras sin la advertencia,
el test falla. Es la equivocación más dañina que este archivo podría cometer, así que está
cerrada con candado.

### Entradas

Dormitorio · dormitorio principal · baño · cocina · sala · comedor · circulación · puertas ·
ventanas · altura libre · garaje · escaleras · orientación y luz · zonificación del programa ·
práctica en clima cálido latinoamericano.

Cada una con `guidance` redactada para citarse al usuario, `dimensions` con mínimo y cómodo,
y `adjacency` donde aplica.

### Recuperación

Puntuación por términos, no embeddings. El corpus son unas decenas de fichas curadas; un
índice vectorial sería más maquinaria que todo el conocimiento junto. Cuando pase de unos
cientos, se revisa.

**Coincidencia de frase con límites de palabra.** Los topics de varias palabras son
justamente los específicos, y sin esto perdían siempre contra los generales:

```
"main bedroom size"
  bedroom-size       → 'bedroom' exacto (+5) + 'room size' (+3)  = 8
  main-bedroom-size  → parciales                                  = 7   ✗ perdía
```

Con coincidencia de frase, `main bedroom` suma +8 y gana. Pero el padding con espacios es
imprescindible: sin él `room size` hace match dentro de "bed**room size**" y el general
vuelve a ganar. Ese fallo apareció en el test y se arregló en el motor, no en el test.

### Regiones

Cada entrada lleva `region`. `general` es la base portable; `latam`, `europe`,
`north-america` para prácticas locales. Una entrada regional **gana a la general con igual
puntuación**, así que una pregunta sobre Bogotá no se contesta con un valor europeo.

Las regionales no se filtran a preguntas no relacionadas: si no alcanzan puntuación mínima,
puntúan cero.

Añadir una región es añadir entradas. La capa de consulta no cambia.

### Herramienta

`query_architecture_knowledge({ topic, spaceType?, region? })`

El prompt le pide que la llame **antes** de elegir una cota, y que cite la base:

> "3,5 m² dan para inodoro, lavamanos y ducha — es práctica común, no un requisito
> normativo."

Cuando no encuentra nada, lo dice y le pide al modelo que decida él y lo declare como
criterio propio, no como dato de referencia.
