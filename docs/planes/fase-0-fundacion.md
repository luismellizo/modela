# Fase 0 — Fundación

**Objetivo:** el repositorio existe, es mío, es público, tiene reglas claras y un mapa de
arquitectura escrito, sin haber roto nada del editor base.

---

## Entregables

| Pieza | Ruta | Qué es |
|---|---|---|
| Fork con historial | `.git` | Clon completo de `pascalorg/editor` con remote `upstream` |
| Licencia | `LICENSE` | MIT con ambos titulares de copyright |
| Brief del agente | `CLAUDE.md` | Mapa vivo del proyecto, se actualiza en cada avance |
| Reglas | `RULES.md` | Cómo se trabaja aquí |
| Planes | `docs/planes/*.md` | Este directorio |
| README | `README.md` | Presentación pública del producto |
| Marca | `packages/brand/` | Nombre, colores, textos, URLs en un solo sitio |

---

## Orden de trabajo

1. **Clonar con historial y reconfigurar remotes.**
   `upstream` → `pascalorg/editor`, `origin` → `luismellizo/modela`.
   Conservar el historial permite `git merge upstream/main` en el futuro y deja la
   atribución MIT impecable.

2. **Auditar el repositorio antes de escribir código.**
   Scene graph, store, historial, tools MCP existentes, punto de montaje de la UI.
   Sin esto, se duplica funcionalidad que ya existe. Resultado en `CLAUDE.md`.

3. **Escribir `LICENSE`, `CLAUDE.md`, `RULES.md`, planes y `README.md`.**

4. **Crear `packages/brand`.**
   Un módulo con la identidad: nombre del producto, tagline, colores, URLs, metadata.
   `apps/editor` lo consume en lugar de tener strings sueltos. Cambiar la marca debe ser
   editar un archivo.

5. **Publicar el repositorio público.**

---

## Criterios de aceptación

- [x] `git log` muestra el historial completo de Pascal más los commits de Modela.
- [x] `git remote -v` lista `upstream` y `origin`.
- [x] `LICENSE` conserva el copyright de Pascal Group Inc.
- [x] `README.md` atribuye el trabajo base a Pascal con enlace.
- [x] `bun install && bun run check-types` pasan sobre el fork sin tocar código fuente.
- [x] El editor arranca con `bun dev` exactamente igual que el upstream.

---

## Fuera de alcance

- Renombrar los paquetes `@pascal-app/*`. Rompería los merges con upstream y el diff
  inicial sería inmanejable. La marca se aplica en la capa visible, no en los internos.
- Eliminar funcionalidad de Pascal que "no me sirve". Se queda; no estorba.
