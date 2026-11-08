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

## Contrato de base de datos para comentarios (T12)

La revisión independiente del dominio mostró que «leer y luego escribir» pierde contra
peticiones simultáneas: 20 envíos a la vez saltaban el límite de 5. Estas reglas viven en
Postgres, no en JavaScript, y el adaptador de Supabase debe usarlas.

| Regla | Dónde se garantiza |
|---|---|
| Límite de 5 comentarios por IP en 10 min | RPC `post_comment`: `pg_advisory_xact_lock(hashtext(ip_hash))`, cuenta, valida la rama e inserta en una transacción |
| Un voto por lector y comentario | `PRIMARY KEY (comment_id, voter_hash)` |
| Repetir el voto lo retira | RPC `toggle_vote`: `DELETE ... WHERE value = v RETURNING`; si no borró, `INSERT ... ON CONFLICT DO UPDATE` |
| Votos solo de +1 o -1 | `CHECK (value IN (-1, 1))` |
| Sin autovoto | `toggle_vote` compara `voter_hash` con `author_token_hash` e `ip_hash` del autor |
| Límite de votos por IP | `toggle_vote`: 60 votos por IP en 10 min |
| Estados válidos | `CHECK (status IN ('visible','quarantined','hidden','deleted'))` |
| Padre del mismo artículo | Clave foránea compuesta `(parent_id, post_slug)` → `(id, post_slug)` |
| Longitud del texto | `CHECK (char_length(body) BETWEEN 2 AND 2000)`, en puntos de código como el dominio |
| Puntuación | Vista con la suma de votos por comentario: `listByPost` devuelve `scores`, nunca los `voter_hash` |
| Acceso | RLS activo y sin políticas públicas; solo la clave secreta del servidor escribe |
| Borrado por el autor | Columna `author_deleted boolean`; `UPDATE ... SET author_deleted = true WHERE id = $1 AND author_token_hash = $2` |
| Rama abierta al votar | `toggle_vote` comprueba con un CTE recursivo que ningún ancestro esté oculto, en cuarentena o borrado |

**Tokens firmados.** El token es `aleatorio.firma`, con la firma HMAC-SHA256 de un secreto que
solo conoce el servidor (`COMMENT_TOKEN_SECRET`, al menos 32 caracteres). Quien quiera votar
sin haber comentado pide un token a una acción protegida por Turnstile.

**Riesgo residual aceptado.** Un bot que rellena el campo trampa recibe siempre éxito, así que
tras 5 envíos podría notar que no lo frena el límite por IP. Igualar ese comportamiento
exigiría guardar los envíos trampa; se decide no guardarlos.
