# one.bmore: plan

**Spec:** `specs/001-one-bmore/spec.md`

**Arquitectura:** Astro genera páginas estáticas. Una sola superficie de servidor,
Astro Actions, atiende comentarios en Cloudflare Workers y habla con Supabase.

**Stack:** Astro 7.4, `@astrojs/mdx`, `@astrojs/rss`, `@astrojs/sitemap`; en
comentarios, `@astrojs/cloudflare` 14, `wrangler` y `@supabase/supabase-js`.

## Restricciones globales

- Sin Tailwind ni librerías de UI; CSS propio con tokens en `src/styles/tokens.css`.
- Identificadores y archivos en inglés; comentarios y commits en español.
- Solo `transform` y `opacity` en animación.
- Push, PR, deploy y paneles externos requieren a Luis.

## Decisiones

| Decisión | Porqué |
|---|---|
| Cloudflare Workers en vez de Netlify | Los estáticos no consumen límite; en Netlify gratis agotar créditos pausa todos los proyectos |
| Adaptador solo en la rama de comentarios | Hasta entonces el sitio es 100 % estático y se prueba sin cuentas |
| Astro Actions en vez de endpoint manual | Validan la entrada con Zod y dan tipos en el cliente; siguen siendo públicas, así que filtran en servidor |
| Fonts API de Astro | Autoaloja las fuentes en el build sin dependencias nuevas |
| Parallax con módulo del periodo | La capa mide `100lvh + 28px`; mover `-(y × 0.12) % 28` se ve infinito sin repintar |
| Cursor con capa perforada | Una capa negra con agujeros en cada punto; detrás solo se mueve una luz con `transform`, sin repintado |
| Fecha de edición por git | Luis no debe recordar nada. Trampa: un clon parcial la falsea, por eso el build ejecuta `git fetch --unshallow` si aplica |
| Series en artículos, sin colección de cursos | Reutiliza diseño y comentarios |
| `Comment store` como interfaz | Tests con memoria, producción con Supabase |

## Mapa de archivos

| Ruta | Responsabilidad |
|---|---|
| `astro.config.mjs` | Fuentes, integraciones, redirección y plugin de fechas |
| `src/content.config.ts` | Esquema (RF-02 a RF-05, RF-10) |
| `src/lib/posts.ts` | Orden, filtro de borradores, series, años, fechas |
| `src/lib/remark-modified-time.mjs` | Fecha de git (RF-07, RF-08) |
| `src/styles/{tokens,base,prose}.css` | Sistema visual |
| `src/components/DotField.astro` | Fondo, parallax y luz (RF-18 a RF-20) |
| `src/components/{BaseHead,SiteHeader,SiteFooter,Logo,PostRow}.astro` | Piezas compartidas |
| `src/layouts/{Page,Post}.astro` | Plantillas |
| `src/pages/**` | Rutas |
| `src/scripts/archive-filter.ts` | Buscador y filtro (RF-13 a RF-15) |
| `src/lib/comments/**` | Dominio de comentarios (rama `feat/comments`) |
| `src/actions/index.ts` | Superficie de servidor |
| `supabase/migrations/**` | Esquema y RLS |
| `tests/*.test.mjs` | Lógica pura |

## Riesgos

| Caso | Comportamiento esperado |
|---|---|
| Artículo sin confirmar en git | Sin fecha de edición y sin fallar el build |
| Título con tildes en el buscador | «habitos» encuentra «Hábitos» |
| `?tipo=` inválido | Se ignora y se muestra todo |
| Sin artículos publicados | Inicio y archivo muestran un mensaje, no una lista vacía rota |
| Comentario con HTML | Se muestra como texto, nunca se interpreta |
