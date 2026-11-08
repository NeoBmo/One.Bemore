# One.Bemore

Un cuaderno abierto: lo que aprendo y lo que no dejo de pensar, escrito con calma para
leer sin prisa.

Es un blog personal a la antigua con una interfaz moderna. Cada artículo es un archivo
Markdown, y el sitio se genera como páginas estáticas.

## Escribir un artículo

Crea un archivo en `src/content/blog/`. El nombre del archivo es la dirección:
`mi-articulo.md` se publica en `/blog/mi-articulo/`.

```yaml
---
title: 'Título del artículo'
description: 'Una o dos líneas para la tarjeta y los buscadores.'
pubDate: 'Nov 08 2026'
type: reflexion # reflexion | historia | curiosidad | ensenanza
note: 'Última anotación: aparece al pie y abre el hilo de comentarios.' # opcional
series: 'Markdown' # opcional, para mini cursos
order: 1 # obligatorio si hay series
draft: false # true lo oculta en producción
---
```

- **Fecha de edición:** se calcula sola desde git. Si un commit no es una edición real del
  contenido, añade `[sin-edicion]` a su mensaje. Para fijarla a mano, usa `updatedDate`.
- **Citas:** las notas al pie de Markdown (`[^1]`) se muestran al final del artículo.
- **Mini cursos:** los artículos con el mismo `series` se enlazan con «Lección anterior» y
  «Lección siguiente», según su `order`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala las dependencias |
| `npm run dev` | Servidor local en `http://localhost:4321` |
| `npm run test` | Tests de la lógica (artículos, fondo y comentarios) |
| `npm run lint` | Revisión de tipos con `astro check` |
| `npm run build` | Genera el sitio en `dist/` |

Requiere Node 24 o superior.

## Cómo está hecho

- **Astro 7** genera páginas estáticas. La única pieza de servidor será la de comentarios.
- **CSS propio**, sin librerías de interfaz, con los tokens en `src/styles/tokens.css`.
- **Una sola fuente:** iA Writer Quattro, autoalojada por la API de fuentes de Astro.
- **Paleta mínima:** negro, texto blanco roto, gris para lo secundario y rosado solo en lo
  que se puede tocar.
- **El fondo** es una hoja negra perforada sobre luces rosadas. Al hacer scroll solo se
  mueve un periodo de la cuadrícula, y como se repite, parece infinito. El ratón y el dedo
  encienden los puntos que tocan, y un clic abre una onda de luz.
- **Entre páginas**, el fondo y la cabecera se quedan quietos y la hoja viaja: hacia
  adelante entra por la derecha y al volver por la izquierda. Usa View Transitions nativas.
- **Movimiento reducido:** si el sistema lo pide, no hay desplazamientos, solo fundidos.

## Comentarios (en construcción)

Anónimos, con ramas, votos y moderación. La lógica ya está escrita y probada en
`src/lib/comments/`; falta conectarla a Supabase y Cloudflare.

- **Token firmado:** cada lector recibe un token firmado por el servidor, y en la base de
  datos solo se guarda su hash.
- **Filtros:** lo sospechoso va a cuarentena y Luis decide.
- **Hilo:** los votos ordenan, nunca ocultan.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/content/blog/` | Artículos en Markdown |
| `src/pages/` | Rutas del sitio |
| `src/components/`, `src/layouts/` | Piezas de interfaz |
| `src/lib/` | Lógica probada: artículos, fondo y comentarios |
| `src/styles/` | Tokens y estilos base |
| `specs/001-one-bmore/` | Especificación, plan y estado de tareas |
| `tests/` | Tests con `node:test` |

## Créditos

El icono y el dibujo de «Sobre mí» son de la hija del autor.
