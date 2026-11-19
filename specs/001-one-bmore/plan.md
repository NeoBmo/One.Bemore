# one.bmore: plan

**Spec:** `specs/001-one-bmore/spec.md`

**Arquitectura:** Astro genera páginas estáticas. Una sola superficie de servidor,
Astro Actions, atiende comentarios en Cloudflare Workers y habla con Supabase.

**Stack:** Astro 7.4, `@astrojs/mdx`, `@astrojs/rss`, `@astrojs/sitemap`; en
comentarios, `@astrojs/cloudflare` 14 y `wrangler`. Supabase se usa por su API REST con `fetch`, sin cliente.

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
| `Comment store` atómico | Cada escritura es una sola llamada (`postComment`, `toggleVote`, `markAuthorDeleted`); las reglas que deben resistir peticiones simultáneas viven en el almacén, como en Postgres |
| Supabase con `fetch` en vez de `@supabase/supabase-js` | Son cuatro llamadas REST; una dependencia menos en el Worker. La clave `sb_secret_…` va en `apikey`, nunca como `Bearer` |
| Variables con `astro:env` y `getSecret()` | El esquema vive en `astro.config.mjs`; se leen en cada petición, nunca se copian al build |
| Adaptador con `imageService: 'compile'` y `session: false` | El blog no usa Cloudflare Images ni sesiones; así el Worker no pide servicios extra |
| Almacén en memoria solo en desarrollo | Sin `SUPABASE_URL` y con `astro dev`, los comentarios viven en memoria; en producción faltar Supabase da «no disponibles» |

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
| `src/actions/index.ts` | Superficie de servidor: `comments.{list,post,vote,remove,readerToken}` |
| `src/lib/comments/server.ts` | Une dominio, IP y Turnstile; sin Astro, se prueba con Node |
| `src/lib/comments/supabase-store.ts` | Adaptador REST; solo llama a las funciones atómicas |
| `src/lib/comments/turnstile.ts` | Verificación del desafío con Cloudflare |
| `wrangler.jsonc`, `.dev.vars.example` | Worker `one-bmore-blog` y variables locales de prueba |
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
| Límite de 5 comentarios por IP en 10 min | RPC `post_comment`: `pg_advisory_xact_lock(1, hashtext(ip_hash))`, cuenta, valida la rama e inserta en una transacción |
| Un voto por lector y comentario | `PRIMARY KEY (comment_id, voter_hash)` |
| Repetir el voto lo retira | RPC `toggle_vote`: `DELETE ... WHERE value = v RETURNING`; si no borró, `INSERT ... ON CONFLICT DO UPDATE` |
| Votos solo de +1 o -1 | `CHECK (value IN (-1, 1))` |
| Sin autovoto | `toggle_vote` compara `voter_hash` con `author_token_hash` e `ip_hash` del autor |
| Límite de votos por IP | `toggle_vote`: 60 intentos por IP en 10 min, contados en `comment_vote_events` antes de leer el comentario |
| Estados válidos | `CHECK (status IN ('visible','quarantined','hidden','deleted'))` |
| Padre del mismo artículo | Clave foránea compuesta `(parent_id, post_slug)` → `(id, post_slug)` con `on delete restrict`: se modera por estado, nunca borrando filas |
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

**Endurecimiento aplicado (migración `20261108010000_comments_hardening`).** Los límites son constantes
dentro de las funciones, no parámetros; un comentario solo nace `visible` o `quarantined`; las
violaciones de restricciones se traducen a códigos (`invalid-parent`, `invalid-input`) sin copiar la
fila; nada nuevo en `public` queda abierto a `anon`.

**Obligaciones de T13 (adaptador de Supabase).**
- `CommentStore` necesita operaciones atómicas que llamen a `post_comment`, `toggle_vote` y
  `mark_author_deleted`. Nunca escribir directo en las tablas.
- `VoteError` debe incluir `rate-limited`, y el resultado de publicar, `invalid-input`.
- El adaptador nunca reenvía al navegador `error.message` ni `error.details` de la base.

**Cierre (migración `20261111000000_comments_lockdown`).**
- `EXECUTE` ya no se concede por defecto a `PUBLIC` en ningún esquema. Toda función nueva necesita
  su `grant execute on function ... to <rol>;` explícito, o fallará con «permission denied».
- Espacios de candado reservados para comentarios: 1 (comentarios por IP), 2 (votos por IP) y
  3 (un lector sobre un comentario). El orden es siempre 2 y luego 3.
- Los hashes se validan antes de tomar candados. Los eventos de voto viejos se borran para todas
  las IPs, pero solo cuando alguien vota: si nadie vota, quedan hasta el siguiente voto.

**Riesgo residual aceptado.** Si Luis cierra una rama justo entre la comprobación y la escritura,
una respuesta o un voto pueden entrar en ella. El efecto es el mismo que si hubieran llegado un
instante antes, y `thread.ts` ya oculta la rama en cuarentena.

## Servidor de comentarios (T13)

**Contrato de las acciones.** Toda respuesta del dominio llega como datos: `{ ok: true, ... }` o
`{ ok: false, error }` con un código (`challenge-failed`, `rate-limited`, `invalid-parent`, etc.).
Una falla de infraestructura (Supabase o Turnstile caídos, variables ausentes, respuesta
inesperada) sale siempre como `ActionError` `SERVICE_UNAVAILABLE` con el mismo texto; el detalle
va solo a `console.error`, y nunca incluye el mensaje de Postgres.

**Orden al publicar.** Primero lo que no gasta el desafío (texto y artículo), luego Turnstile, y al
final el dominio. Votar y borrar no piden desafío: exigen un token firmado, que solo se obtiene
comentando o con `readerToken`, que sí lo pide.

**Claves de prueba de Turnstile.** `1x0000000000000000000000000000000AA` aprueba cualquier código
y `2x0000000000000000000000000000000AA` rechaza todos. Sirven en local; en producción el Worker
necesita la clave secreta real de Luis.

**Claves de prueba fuera de producción.** Si el Worker no corre con `astro dev` y
`TURNSTILE_SECRET_KEY` es una clave de prueba (`1x…`, `2x…` o `3x…`), los comentarios quedan «no
disponibles» en vez de abiertos a bots. Verificado con el Worker compilado.

**Verificado contra la base real (2026-11-18), como `service_role` y sin dejar filas.** Permisos de
lectura en `comments` y `comment_scores`, ejecución de las tres funciones, y formas de respuesta:
`post_comment` → `{ok, id|error}`, `toggle_vote` → texto, `mark_author_deleted` → booleano, vista →
`{comment_id, score}`. **Sin verificar:** la llamada REST con la clave `sb_secret_…` en `apikey`,
porque esa clave solo la tiene Luis. Se comprueba al desplegar (T16) o poniéndola en `.dev.vars`.

**Riesgos aceptados.**
- `list` y `remove` no tienen límite de frecuencia propio; `list` hace 1 + N/100 consultas.
  Si alguien lo martilla, gasta cuota gratuita. Mitigación futura: caché corta o `ratelimits`.
- No se compara el `hostname` que devuelve Turnstile: la restricción de dominios del widget
  en Cloudflare cumple esa función.
- Más de 1000 comentarios en un artículo: los nuevos no se mostrarían. Queda un aviso en el
  registro del Worker.
- Desplegar siempre con `npx wrangler deploy` sin `-c`: usa la configuración que genera el build
  (`dist/server/wrangler.json`). El build copia `.dev.vars` a `dist/server/`, que no se sirve.

**Riesgo abierto: pausa del plan gratuito.** Supabase pausa el proyecto tras 7 días sin
actividad (pasó el 2026-11-18). Mientras esté pausado, los comentarios quedan «no disponibles» y
el artículo sigue legible (RF-32), pero reactivarlo es manual. Pendiente de decidir con Luis.
