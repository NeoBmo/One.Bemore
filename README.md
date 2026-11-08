# One.Bemore

Blog personal a la antigua con interfaz moderna: un cuaderno negro de puntos donde
cada artículo es un archivo Markdown.

## Escribir un artículo

Crea un archivo en `src/content/blog/` con este frontmatter:

```yaml
---
title: 'Título del artículo'
description: 'Una o dos líneas para listados y buscadores.'
pubDate: 'Nov 07 2026'
type: reflexion # reflexion | historia | curiosidad | ensenanza
note: 'Última anotación: aparece al pie y abre el hilo.' # opcional
series: 'Markdown' # opcional, para mini cursos
order: 1 # obligatorio si hay series
draft: false # true lo oculta en producción
---
```

La fecha de edición se calcula sola desde git. Si un commit no es una edición real
de contenido, añade `[sin-edicion]` a su mensaje.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor local en `http://localhost:4321` |
| `npm run test` | Tests de la lógica |
| `npm run lint` | Revisión de tipos con `astro check` |
| `npm run build` | Genera el sitio en `dist/` |

## Hecho con

Astro 7, CSS propio sin librerías de interfaz, iA Writer Quattro, JetBrains Mono y Shantell Sans
autoalojadas. El estado del proyecto vive en `specs/001-one-bmore/tasks.md`.
