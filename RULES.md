# RULES.md — Reglas de trabajo en Modela

Reglas no negociables para cualquiera (humano o agente) que toque este repositorio.

---

## 1. `CLAUDE.md` se actualiza en cada avance

**Obligatorio.** Ningún avance se considera terminado si `CLAUDE.md` quedó desactualizado.

En cada avance hay que revisar y, si cambió, actualizar:

- la tabla **Estado del proyecto** (fase y checkboxes);
- el **Mapa del repositorio**, si se añadieron o movieron paquetes/carpetas;
- **Las piezas que importan**, si cambió una API de dominio;
- **Comandos** y **Variables de entorno**, si se añadió alguno;
- el **Registro de avances** al final: una fila por avance, en español, con fecha.

La actualización de `CLAUDE.md` va **en el mismo commit** que el avance que la motiva.
Un commit que cambia arquitectura y no toca `CLAUDE.md` está incompleto.

---

## 2. Commitear cada pequeño avance

Un avance = un commit. Nada de commits gigantes de "todo el copiloto".

**Formato:**

```
<verbo en infinitivo> <qué> [<dónde>]
```

- Mensaje **en español**, en minúscula, sin punto final.
- Máximo ~60 caracteres en el asunto.
- Escrito como lo escribiría Luis: directo, sin ceremonia, sin "feat:"/"chore:".
- Cuerpo solo si el *porqué* no es obvio desde el asunto. Dos o tres líneas, nunca más.

**Bien:**

```
añadir abstracción de proveedor de IA
conectar el agente a SceneOperations
arreglar el colapso de undo cuando el turno falla
mover la validación de imágenes al servidor
actualizar CLAUDE.md con la fase 2
```

**Mal:**

```
feat(ai): implement AIProvider abstraction with OpenRouter adapter
WIP
cambios varios
Fix bug
Se ha implementado la funcionalidad de análisis de imágenes arquitectónicas
```

**Cuándo commitear:** cuando una pieza funciona y el typecheck pasa. No al final del día,
no cuando "ya está todo". Si llevas 300 líneas sin commitear, te pasaste.

---

## 3. No romper el editor base

Pascal funciona. Modela añade, no reescribe.

- No se eliminan funcionalidades del editor.
- No se cambian APIs públicas de `@pascal-app/*` sin necesidad real.
- No se renombran los paquetes upstream — el remote `upstream` debe seguir mergeable.
- Si algo del upstream no encaja, se extiende; no se parchea en su sitio.

Antes de escribir un tool nuevo: buscar en `packages/mcp/src/tools/`. Casi siempre ya existe.

---

## 4. Respetar las fronteras de capas

| Capa | Puede importar | Nunca importa |
|---|---|---|
| `packages/core` | nada del repo | Three.js, viewer, editor, app |
| `packages/viewer` | core | `useEditor`, herramientas, modos del editor |
| `packages/editor` | core, viewer | app |
| `packages/ai` | core (tipos), mcp (`SceneOperations`) | React, DOM, Three.js, componentes |
| `apps/editor` | todo | — |

La lógica de IA **no vive dentro de componentes React**. Los componentes llaman al agente;
el agente no sabe que React existe.

---

## 5. Nada de prototipos falsos

- Ningún botón que no haga nada.
- Ninguna respuesta simulada presentada como real.
- Ningún tool registrado que no ejecute de verdad contra la escena.

Si algo no se puede implementar todavía, no se maqueta: se documenta en el plan de fase
como pendiente y se deja fuera de la UI.

El adaptador `mock` es la única excepción, y está etiquetado como mock en su nombre,
en la config y en la UI.

---

## 6. Seguridad de las herramientas

- Todo tool declara schema Zod de entrada **y** de salida.
- Todo argumento se valida antes de tocar la escena. El prompt nunca es la defensa.
- Límites explícitos: número de nodos por operación, dimensiones máximas, pasos del loop.
- Las operaciones destructivas (borrar en masa, reemplazar la escena) pasan por propuesta
  con confirmación del usuario.
- Las claves de API viven **solo** en el servidor. Nunca en un bundle del cliente.

---

## 7. Tests para lo crítico

Antes de dar por cerrada una pieza:

- **Agente**: selección de tool, errores de tool, cancelación, tope de pasos.
- **Escena**: crear, modificar, borrar, transacción, undo de una operación completa.
- **Multimodal**: validación de archivos, extracción estructurada, `observed`/`inferred`/`unknown`.
- **Seguridad**: argumentos inválidos, tool inexistente, operación destructiva sin confirmar.

`bun test` verde antes de commitear. Sin excepciones.

---

## 8. Antes de dar algo por terminado

```bash
bun run check-types
bun run check
bun test
```

Los tres en verde. Si uno falla, no está terminado — y no se dice que lo está.

---

## 9. Tokens y coste

El copiloto habla con un LLM de pago. Cada mensaje cuesta dinero real.

- Nunca se envía la escena completa. Se envía un resumen compacto.
- El contexto se recupera bajo demanda (*scene context retrieval*), no de golpe.
- El historial largo se resume.
- El detalle fino se pide con tool calls, no se precarga.

---

## 10. Marca

Modela es el producto; Pascal es la base.

- Los avisos de copyright y licencia **se conservan** (`LICENSE` incluye ambos titulares).
- La atribución a Pascal se mantiene visible en el README.
- Los textos, colores, logo, favicon y metadata de la marca viven en `packages/brand/`
  y en ningún otro sitio, para poder cambiarlos en un solo lugar.
