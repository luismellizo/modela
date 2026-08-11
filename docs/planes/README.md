# Planes — de 0 a 100%

Ruta completa para convertir el fork de Pascal Editor en Modela, un producto de diseño
arquitectónico asistido por IA.

| Plan | Fase | Objetivo | Estado |
|---|---|---|---|
| [`fase-0-fundacion.md`](fase-0-fundacion.md) | 0 | Fork, reglas, marca, documentación | ✅ |
| [`fase-1-copiloto-mvp.md`](fase-1-copiloto-mvp.md) | 1 | El agente controla la escena por texto | 🚧 |
| [`fase-2-vision.md`](fase-2-vision.md) | 2 | Imágenes y planos → arquitectura | ⬜ |
| [`fase-3-agente.md`](fase-3-agente.md) | 3 | Loop autónomo, validación, alternativas | ⬜ |
| [`fase-4-producto.md`](fase-4-producto.md) | 4 | Memoria, conocimiento, optimización | ⬜ |

## Cómo se lee un plan

Cada plan tiene la misma estructura:

- **Objetivo** — qué significa "terminado" en una frase.
- **Entregables** — lista de piezas concretas con su ruta en el repo.
- **Orden de trabajo** — tareas en el orden en que hay que hacerlas, cada una es un commit.
- **Criterios de aceptación** — cómo se comprueba que funciona de verdad.
- **Fuera de alcance** — lo que explícitamente *no* entra, para no derrapar.

## Regla que aplica a todos

Al cerrar cada tarea: actualizar `CLAUDE.md` y commitear. Ver `RULES.md`.
