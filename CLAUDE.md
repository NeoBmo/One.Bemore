# One.Bemore

Blog personal en Astro. Luis escribe los artículos solo en Markdown.

- **Estado y siguiente paso:** `specs/001-one-bmore/tasks.md`, sección «Retoma».
- **Requisitos y decisiones:** `specs/001-one-bmore/spec.md` y `plan.md`.
- **Verificar:** `npm run test`, `npm run lint` y `npm run build`.
- **Publicar un artículo:** añadir un `.md` en `src/content/blog`.

## Reglas del proyecto

- CSS propio con tokens; sin Tailwind ni esquinas redondeadas.
- Paleta mínima: texto blanco roto, gris para lo secundario y rosado solo en lo que se toca.
- Una sola fuente (iA Writer Quattro); menos es más: no explicar de más al lector.
- Es una experiencia propia: no copiar el estilo del portafolio.
- El sitio no explica el significado de los nombres.
- Animar solo `transform` y `opacity`, y respetar `prefers-reduced-motion`.
