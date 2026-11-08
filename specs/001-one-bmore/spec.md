# one.bmore: spec

Perfil `con-suite` (`node --test`). Riesgo alto solo en comentarios: datos públicos
escritos por anónimos. La spec va en español porque Luis la revisa y decide sobre ella.

## Objetivo

Blog personal a la antigua con interfaz moderna: se escribe solo con Markdown y se
lee en un cuaderno negro de puntos. Debe ser sencillo de mantener y presumible.

**Fuera de alcance:** escribir artículos (los escribe Luis), panel de administración,
cuentas de usuario y funciones de IA dentro del blog.

## Identidad

| Tema | Decisión |
|---|---|
| Nombre | One.Bemore; el sitio no explica su significado |
| Color | Negro `#000`, texto blanco roto `#ececec`, gris `#9a9a9a` para lo secundario y rosado `#f472b6` solo en lo que se toca. Sin esquinas redondeadas |
| Fuente | iA Writer Quattro en todo el sitio; monoespaciada del sistema solo en bloques de código |
| Principio | Menos es más: no explicar de más al lector |
| Logo | La cara del dibujo de su hija como icono; el dibujo completo en `/sobre-mi/` |
| Fondo | Cuaderno negro de puntos muy tenues, parallax lento y rastro de luz con ratón o dedo |
| Estilos | CSS propio con tokens, sin Tailwind |

## Requisitos

### Contenido

- RF-01: EL SISTEMA generará cada artículo desde un archivo Markdown en `src/content/blog`, sin tocar código.
- RF-02: SI el frontmatter no cumple el esquema, ENTONCES EL SISTEMA fallará el build indicando el campo.
- RF-03: EL SISTEMA aceptará `type` con uno de: `reflexion`, `historia`, `curiosidad`, `ensenanza`.
- RF-04: MIENTRAS un artículo tenga `draft: true`, EL SISTEMA lo excluirá de producción, listados y RSS.
- RF-05: CUANDO un artículo tenga `series`, EL SISTEMA enlazará la lección anterior y la siguiente según `order`; fuera de una serie no habrá anterior ni siguiente.
- RF-06: EL SISTEMA mostrará título, fecha de creación y minutos de lectura en cada artículo y tarjeta.
- RF-07: CUANDO un commit cambie un artículo en un día posterior a `pubDate`, EL SISTEMA mostrará la fecha de edición.
- RF-08: SI el commit incluye `[sin-edicion]` o es anterior al 2026-11-08, ENTONCES EL SISTEMA no lo contará como edición.
- RF-09: SI existe `updatedDate` en el frontmatter, ENTONCES EL SISTEMA la usará en lugar de la fecha de git.
- RF-10: CUANDO un artículo tenga `note`, EL SISTEMA la mostrará al pie como «Última anotación», firmada por Luis.

### Navegación

- RF-11: EL SISTEMA mostrará en el inicio el título, una línea que diga qué es el blog y «Lo último» plegado; al abrirlo, los 3 artículos más recientes.
- RF-12: EL SISTEMA ofrecerá `/blog/` como lista de 10 artículos que crece con «Ver más».
- RF-13: CUANDO la persona escriba en el buscador, EL SISTEMA filtrará por título sin recargar.
- RF-14: CUANDO la persona elija un tipo, EL SISTEMA filtrará por ese tipo y lo reflejará en `?tipo=`.
- RF-15: SI JavaScript no está disponible, ENTONCES EL SISTEMA mostrará la lista completa.
- RF-16: EL SISTEMA ofrecerá `/sobre-mi/`, `/rss.xml` (sin enlace visible), sitemap y una página 404 propia.
- RF-17: CUANDO se visite `/about`, EL SISTEMA redirigirá a `/sobre-mi/`.

### Apariencia y movimiento

- RF-18: MIENTRAS se haga scroll, EL SISTEMA moverá los puntos a 0.12 de la velocidad del contenido.
- RF-19: CUANDO el ratón o el dedo se muevan, EL SISTEMA iluminará los puntos cercanos y dejará un rastro que se desvanece.
- RF-19b: CUANDO se haga clic o se toque la pantalla, EL SISTEMA abrirá una onda de luz desde ese punto que se apaga en menos de un segundo.
- RF-20: MIENTRAS `prefers-reduced-motion: reduce` esté activo, EL SISTEMA dejará el fondo quieto y sin transiciones de movimiento.
- RF-21: EL SISTEMA animará solo `transform` y `opacity`, y cada animación comunicará un estado.
- RF-22: CUANDO se navegue entre páginas, EL SISTEMA dejará quietos el fondo y la cabecera y moverá la hoja: hacia adelante entra por la derecha y al volver por la izquierda, con el título viajando desde la tarjeta.
- RF-23: EL SISTEMA no tendrá scroll horizontal a 375 px y mantendrá contraste mínimo de 4.5:1 en texto.

### Comentarios

- RF-24: EL SISTEMA mostrará comentarios solo al final del artículo, colgando de la última anotación; sin anotación, el primero abre el hilo.
- RF-25: CUANDO alguien comente o quiera votar por primera vez, EL SISTEMA emitirá un token aleatorio firmado con un secreto del servidor y guardará solo su hash; un token sin firma válida no sirve.
- RF-26: CUANDO un comentario pase los filtros, EL SISTEMA lo publicará al instante.
- RF-27: SI un comentario parece spam, ENTONCES EL SISTEMA lo dejará en `quarantined`, invisible para el público.
- RF-28: CUANDO alguien responda, EL SISTEMA guardará `parent_id` y mostrará sangría hasta 4 niveles.
- RF-29: CUANDO un lector vote, EL SISTEMA guardará un voto `+1` o `-1` por comentario y lector.
- RF-30: EL SISTEMA usará los votos para ordenar, nunca para ocultar.
- RF-31: CUANDO Luis marque `hidden` o `deleted`, EL SISTEMA conservará la rama y mostrará un texto sustituto.
- RF-32: SI Supabase falla, ENTONCES EL SISTEMA mantendrá el artículo legible e indicará que los comentarios no están disponibles.
- RF-33: EL SISTEMA mantendrá la clave secreta solo en el servidor, con RLS activo y sin políticas públicas.
- RF-34: SI el texto tiene menos de 2 o más de 2000 caracteres, o el alias más de 40, ENTONCES EL SISTEMA rechazará el comentario indicando el motivo.
- RF-35: SI una misma IP envía más de 5 comentarios en 10 minutos, ENTONCES EL SISTEMA rechazará los siguientes hasta que pase la ventana.
- RF-36: SI el campo trampa llega relleno, ENTONCES EL SISTEMA responderá como si aceptara el comentario, sin guardarlo.
- RF-37: CUANDO quien comentó lo borre con su token, EL SISTEMA lo marcará como borrado por su autor sin tocar el estado de moderación; nunca volverá a publicarse, aunque Luis lo apruebe, y nadie más podrá borrarlo.
- RF-38: EL SISTEMA no permitirá votar el propio comentario; repetir el mismo voto lo retira.
- RF-39: EL SISTEMA guardará la IP solo como hash con sal secreta, nunca en claro.

**Moderación automática a cuarentena:** más de un enlace, una palabra de la lista de `banned-words.ts`,
texto mayormente en mayúsculas (más de 20 letras y más del 70 % mayúsculas) o un carácter repetido 8 veces seguidas.
Las respuestas a un comentario en cuarentena tampoco se muestran.

## Criterios de aceptación

1. `npm run test`, `npm run lint` y `npm run build` pasan.
2. Añadir un `.md` válido publica un artículo sin más cambios.
3. Verificado en navegador real: escritorio, 375 px, `prefers-reduced-motion` y consola sin errores.
4. El sitio pasa `web-quality-gate` antes de publicarse.
5. Comentarios: revisión independiente con la capacidad más alta y aprobación de Luis.

## Sugerencias

| Sugerencia | Estado |
|---|---|
| Última anotación como raíz del hilo | v1 |
| Archivo por año, anterior y siguiente, RSS visible | v1 |
| Colofón en `/sobre-mi/` que explique cómo está hecho | v1 |
| Fuente propia con la letra de Luis | Después; pasa por `vet` |
| Imagen social por artículo | Después |
| Lista de sitios recomendados | Después; necesita sus enlaces |
| Página `/ahora`, botones 88x31 | Después |
| Aviso a Luis cuando entre un comentario | Después; es el mayor riesgo de abrirlos |
