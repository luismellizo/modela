# Fase 4 — De herramienta a producto

**Objetivo:** Modela recuerda el proyecto entre sesiones, conoce el dominio arquitectónico de
verdad, y optimiza distribuciones en lugar de solo dibujarlas.

---

## Memoria de proyecto

Hoy la conversación muere al recargar. Un arquitecto no olvida el encargo.

Separación estricta, ya presente desde la fase 1, que aquí se persiste:

| Capa | Qué guarda | Autoridad |
|---|---|---|
| **Estado de la escena** | Lo que existe de verdad en el scene graph | **Siempre gana** |
| **Memoria de proyecto** | El encargo: presupuesto, estilo, restricciones, decisiones | Contexto |
| **Memoria conversacional** | Lo que se dijo en esta sesión | La más débil |

Si el chat dice "la casa tiene 3 habitaciones" y la escena tiene 4, la escena tiene razón y
el agente lo dice en voz alta.

**Entregables:** `packages/ai/src/memory/project.ts`, persistencia en el `SceneStore` existente
de `packages/mcp/src/storage/`, y extracción automática de hechos del proyecto desde la
conversación.

---

## Base de conocimiento arquitectónico

Conocimiento de dominio consultable, no cableado en el prompt.

- Dimensiones mínimas y cómodas por tipo de espacio.
- Anchos de circulación, radios de giro, huellas de puertas.
- Relaciones de adyacencia habituales (cocina-comedor, baño-habitación).
- Alturas y proporciones por tipología.
- Orientación e iluminación natural según hemisferio.

Formato: fichas con schema, recuperables por consulta. **Regionalizable** — lo que es
razonable en Bucaramanga no es lo mismo que en Oslo.

Entrega como tool: `query_architecture_knowledge(topic, context)`.

---

## Catálogo de componentes y materiales

Sobre el catálogo que ya existe en `packages/mcp/src/resources/catalog-items.ts` y
`search_assets`: enriquecerlo con propiedades que le sirvan al agente — dimensiones reales,
holguras necesarias, acabado, coste relativo.

Permite: "amuebla el dormitorio principal con estilo minimalista y presupuesto medio".

---

## Optimización de distribución

El paso de dibujar a diseñar.

- Maximizar iluminación natural según orientación.
- Minimizar recorridos de circulación.
- Cumplir superficies objetivo por espacio.
- Equilibrar zonas de día y de noche.

Se implementa como evaluación + búsqueda sobre alternativas: generar variantes (fase 3),
puntuarlas con funciones objetivo, proponer la mejor explicando **por qué** es mejor.

**Entregables:** `packages/ai/src/optimization/objectives.ts`, `.../score.ts`, `.../search.ts`.

---

## Branching de proyectos

Los snapshots de la fase 3 se vuelven persistentes:

```
Proyecto Casa Mellizo
├── main            (propuesta entregada)
├── dos-pisos       (variante en estudio)
└── presupuesto-bajo
```

Duplicar, comparar lado a lado, fusionar decisiones puntuales.

---

## Orden de trabajo

1. Memoria de proyecto persistente con precedencia estado > proyecto > conversación.
2. Extracción automática de hechos del proyecto desde la conversación.
3. Esquema de la base de conocimiento y primeras fichas.
4. Tool `query_architecture_knowledge`.
5. Enriquecimiento del catálogo con propiedades de diseño.
6. Amueblado por estilo y presupuesto.
7. Funciones objetivo de optimización.
8. Búsqueda sobre alternativas puntuadas.
9. Explicación de la propuesta ganadora en lenguaje natural.
10. Branching persistente de proyectos.
11. Actualizar `CLAUDE.md`.

---

## Criterios de aceptación

- [ ] Cerrar y reabrir el editor conserva el encargo del proyecto.
- [ ] Si la escena contradice al chat, el agente cree a la escena y lo señala.
- [ ] "Maximiza la iluminación natural" produce un cambio medible y explicado.
- [ ] "Amuebla el salón con estilo nórdico" coloca mobiliario real del catálogo.
- [ ] Una rama de proyecto se puede crear, comparar y descartar sin perder la principal.

---

## Fuera de alcance permanente

- Cálculo estructural. No somos un software de estructuras y no vamos a fingirlo.
- Certificación normativa. Podemos avisar de posibles incumplimientos; no certificamos nada.
