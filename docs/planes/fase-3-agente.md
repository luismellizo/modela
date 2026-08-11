# Fase 3 — Agente autónomo

**Objetivo:** el copiloto deja de ser un ejecutor de instrucciones y pasa a comportarse como
un arquitecto: planifica, construye, revisa su propio trabajo, detecta errores y los corrige
antes de decir que terminó.

---

## El ciclo

```
petición
   ↓
INTENCIÓN        ¿generar, modificar, analizar, comparar?
   ↓
CONTEXTO         solo lo que hace falta para esta intención
   ↓
PLAN             lista de operaciones, revisable
   ↓
EJECUCIÓN        tools contra el Scene Graph
   ↓
VALIDACIÓN       validate_scene + reglas propias
   ↓
CORRECCIÓN       si algo falla, arreglarlo y volver a validar
   ↓
RESULTADO        resumen honesto de lo hecho y lo que quedó pendiente
```

Ejemplo real del ciclo: crea habitaciones → crea muros → inserta puertas → valida →
detecta una puerta que cae fuera de un muro → la reposiciona → vuelve a validar → informa.

---

## Entregables

| Pieza | Ruta | Qué hace |
|---|---|---|
| Clasificador de intención | `packages/ai/src/agent/intent.ts` | Enruta la petición y decide qué contexto cargar |
| Planificador | `packages/ai/src/agent/planner.ts` | Petición → plan de operaciones estructurado |
| Propuestas | `packages/ai/src/agent/proposal.ts` | Plan revisable con aplicar/cancelar |
| Validación | `packages/ai/src/validation/rules.ts` | Reglas arquitectónicas extensibles |
| Autocorrección | `packages/ai/src/agent/correct.ts` | Error de validación → operación de arreglo |
| Snapshots | `packages/ai/src/alternatives/snapshot.ts` | Guardar y restaurar estados de la escena |
| Alternativas | `packages/ai/src/alternatives/variants.ts` | N propuestas sin destruir la actual |
| UI de propuesta | `apps/editor/components/copilot/proposal-card.tsx` | Plan de cambios con aplicar/cancelar |
| UI de alternativas | `apps/editor/components/copilot/alternatives.tsx` | Comparar y elegir |

---

## Propuestas: cuándo sí y cuándo no

Ejecutar directo si la operación es **pequeña y reversible**: mover un objeto, cambiar una
dimensión, añadir una ventana.

Proponer antes si es **grande o destructiva**:

- más de N nodos afectados (configurable, por defecto 10);
- borrado de nodos existentes;
- reemplazo de la escena;
- generación completa desde cero sobre una escena que ya tiene contenido.

```
Plan de cambios

✓ Crear habitación principal        18.2 m²
✓ Crear 3 habitaciones              11.4 / 10.8 / 9.6 m²
✓ Crear 2 baños                      4.2 / 3.1 m²
✓ Crear cocina abierta              14.0 m²
✓ Crear sala-comedor                28.5 m²
✓ Crear garaje                      32.0 m²
✓ Crear terraza                     16.0 m²

[Aplicar cambios]  [Cancelar]
```

---

## Reglas de validación

Extensibles, no cableadas. Cada regla es una función pura sobre el scene graph:

```ts
type ValidationRule = {
  id: string
  severity: 'error' | 'warning' | 'hint'
  check(scene: SceneSnapshot): ValidationIssue[]
}
```

Arranque: puerta fuera de muro, habitación sin acceso, muro sin conectar, solape de espacios,
ancho de circulación insuficiente, habitación sin ventana.

**Regla sobre las reglas:** no se inventan normas rígidas que el editor no puede representar.
Si una comprobación no se puede expresar sobre el scene graph, no entra.

---

## Alternativas sin destruir

```
Diseño actual
├── Alternativa A — circulación central
├── Alternativa B — zonas día/noche separadas
└── Alternativa C — planta abierta
```

Se apoya en `generate_variants`, que ya existe en `packages/mcp/src/tools/variants/`.
Cada alternativa es un snapshot; cambiar entre ellas es restaurar un snapshot, y eso es
un solo paso de undo.

---

## Orden de trabajo

1. Clasificador de intención y carga de contexto por intención.
2. Planificador: petición → plan estructurado.
3. ~~Sistema de propuestas con umbral configurable.~~ ✅ `propose_plan` + `applyProposal`
4. ~~Tarjeta de plan en la UI con aplicar/cancelar.~~ ✅ `proposal-card.tsx`
5. Motor de reglas de validación + primeras seis reglas.
6. Bucle de autocorrección con tope de intentos.
7. Snapshots de escena.
8. Generación de alternativas sobre `generate_variants`.
9. UI de comparación de alternativas.
10. Tests del ciclo completo con provider mock determinista.
11. Actualizar `CLAUDE.md`.

---

## Criterios de aceptación

- [ ] "Diseña una casa de dos pisos" produce un plan antes de tocar la escena.
- [ ] Cancelar el plan deja la escena exactamente igual.
- [ ] Una puerta mal colocada por el agente la detecta él y la corrige sin que se lo pidan.
- [ ] "¿Qué problemas tiene esta distribución?" devuelve incidencias reales de la escena.
- [ ] "Dame otras tres opciones" genera tres alternativas y la actual sigue intacta.
- [ ] El bucle de corrección tiene tope y no se queda dando vueltas.

---

## Fuera de alcance

- Optimización numérica de distribución (asignación de superficies, soleamiento). Fase 4.
- Branching persistente tipo git de proyectos. Fase 4.
