# Validación y autocorrección

## Dos validaciones distintas

| | `validate_scene` (core) | `check_design` (Modela) |
|---|---|---|
| Pregunta | ¿Cada nodo cumple su schema? | ¿El edificio tiene sentido? |
| Detecta | Un muro con `height: "alto"` | Una puerta que sobresale del muro |
| Vive en | `packages/mcp` | `packages/ai/src/validation/` |

Las dos hacen falta. Un nodo puede ser perfectamente válido según Zod y describir una
habitación en la que no se puede entrar.

## La regla sobre las reglas

**Una regla tiene que ser computable desde el scene graph.**

Lo que necesita información que el editor no tiene —normativa local, cálculo estructural,
soleamiento real— no es una regla: es una suposición disfrazada de regla. Y no entra.

Esto se decidió antes de escribir la primera. Es fácil poner "el pasillo debe medir 1,20 m"
porque suena a arquitectura; es mentira si el editor no sabe qué es un pasillo.

## Las reglas que hay

| Id | Severidad | Qué detecta |
|---|---|---|
| `opening-outside-wall` | error | Puerta o ventana que sobresale de su muro, o más ancha que él, o sin muro |
| `degenerate-wall` | error | Muro de longitud cero — casi siempre una coordenada mal escrita |
| `room-without-access` | warning | Habitación sin ninguna puerta en sus muros de borde |
| `overlapping-spaces` | warning | Dos zonas pisándose en el mismo nivel |
| `unusable-room` | warning | Habitación de menos de 1 m² — típico error de unidades |
| `impassable-space` | warning | Espacio de menos de 0,80 m en su lado corto |
| `room-without-daylight` | hint | Habitación de más de 4 m² sin ventana |

Severidades:

- **error** — geometría rota. Dispara la autocorrección.
- **warning** — casi seguro un fallo, pero legítimo en algún diseño. No bloquea.
- **hint** — información. Un baño sin ventana está bien.

### Muros de borde: por geometría, no por metadata

`create_room` etiqueta sus muros con `roomName`. Sería lo cómodo para encontrarlos. Pero un
muro dibujado a mano por el usuario, o uno movido después, también forma el borde y las
reglas tienen que verlo.

Así que `boundaryWalls()` busca, por cada arista del polígono, un muro cuyos extremos
coincidan (con tolerancia de 5 cm), en cualquier orden. Hay un test específico con una
habitación construida a mano sin ninguna metadata.

## Cada mensaje lleva su arreglo

```ts
{
  rule: 'opening-outside-wall',
  severity: 'error',
  message: 'door "Entrada" (door_a1) overhangs its wall: it sits at 2.95 m on a 3.00 m wall',
  nodeIds: ['door_a1', 'wall_b2'],
  fix: 'Set its position along the wall between 0.45 and 2.55 m — update_node with position, or delete it and re-add with a t between 0 and 1.',
}
```

El `fix` no es cortesía. Sin él, el modelo tiene que deducir la corrección desde el síntoma,
y la deduce mal. Con los números concretos, la arregla al primer intento.

## Autocorrección

El disparador es el momento exacto en que fallan estas cosas: **cuando el modelo cree que
ha terminado**.

```
el modelo deja de llamar herramientas
        ↓
¿tocó la escena este turno?  ──no──► fin
        ↓ sí
correr las reglas
        ↓
¿errores?  ──no──► fin (se emite el evento igual: "revisión pasada" es información)
        ↓ sí
¿quedan rondas?  ──no──► fin, con los errores en el resultado
        ↓ sí
devolver los errores al modelo
        ↓
el modelo arregla → vuelve a parar → revalidar
```

Dos rondas por defecto (`maxCorrectionRounds`). Se apaga con `autoCorrect: false`.

### Se devuelve como turno de usuario

Los errores vuelven al modelo como mensaje `user`, con prefijo:

```
[automatic design check] 1 error(s) found in what you just built:
- [error] door "Entrada" overhangs its wall… → Set its position between 0.45 and 2.55 m
Fix them with the scene tools, then say what you changed. Do not repeat the whole build.
```

Es el único rol que todos los proveedores aceptan a mitad de conversación. El prefijo lo
mantiene honesto: el modelo ve que eso no lo escribió la persona.

### Se rinde en voz alta

Si tras las rondas quedan errores, el turno **completa igualmente** pero
`result.validation.errors > 0` y la UI lo muestra como "unresolved". Nadie puede afirmar que
pasó la revisión cuando no pasó.

Test: `self-correction.test.ts`, "gives up after the correction budget and reports honestly".

## En la UI

`design-check.tsx` muestra el veredicto siempre, incluso limpio:

- corrigiendo → `Found 2 problems — fixing` con spinner;
- limpio → `Design check passed`;
- con incidencias → contador plegable con cada `message` y su `fix`.

Mostrar el "pasó" es deliberado. El silencio no se distingue de no haber mirado.

## Añadir una regla

```ts
// packages/ai/src/validation/rules.ts
export const miRegla: ValidationRule = {
  id: 'stair-without-headroom',
  severity: 'warning',
  description: 'Stairs need clearance above them',
  check(view) {
    // view.nodes         — todos los nodos
    // view.byLevel        — nodos agrupados por nivel, ya resuelto
    return issues
  },
}
```

Añadirla a `DEFAULT_RULES` y escribir su test. Si lanza, el motor lo convierte en un `hint`
en vez de tumbar la revisión entera — hay test de eso también.
