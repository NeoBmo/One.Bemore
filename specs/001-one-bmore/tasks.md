# one.bmore: tareas

Estados: `pendiente → en_progreso → implementada → validada`.
Actualiza esta tabla en el mismo commit que termina cada tarea.

## Ramas

Cada rama nace de la anterior y tendrá su PR hacia `main`, en este orden.

| Orden | Rama | Contiene |
|---|---|---|
| 1 | `chore/reset-base` | Limpieza, Astro al día, planificación |
| 2 | `feat/visual-identity` | Tokens, fuentes, fondo, movimiento |
| 3 | `feat/site-pages` | Esquema, inicio, archivo, artículo |
| 4 | `feat/comments` | Servidor y comentarios |
| 5 | `chore/launch` | Calidad, renombre y despliegue |

## Tareas

| Id | Tarea | Rama | Requisitos | Estado |
|---|---|---|---|---|
| T1 | Eliminar artefactos anteriores | `chore/reset-base` | Limpieza | implementada |
| T2 | Planificación y documento del proyecto | `chore/reset-base` | Retoma | implementada |
| T3 | Quitar Tailwind y actualizar dependencias | `chore/reset-base` | Identidad | implementada |
| T4 | Tokens, fuentes y estilos base | `feat/visual-identity` | RF-23 | implementada |
| T5 | Fondo de puntos con parallax y luz | `feat/visual-identity` | RF-18 a RF-21 | implementada |
| T6 | Esquema y lógica de artículos con tests | `feat/site-pages` | RF-01 a RF-09 | implementada |
| T7 | Inicio, cabecera y pie | `feat/site-pages` | RF-11, RF-16 | implementada |
| T8 | Archivo con búsqueda y filtro | `feat/site-pages` | RF-12 a RF-15 | implementada |
| T9 | Artículo, anotación y series | `feat/site-pages` | RF-05 a RF-10, RF-22 | implementada |
| T10 | Sobre mí, 404, RSS y redirección | `feat/site-pages` | RF-16, RF-17 | implementada |
| T11 | Dominio de comentarios con tests | `feat/comments` | RF-25 a RF-31, RF-34 a RF-39 | validada |
| T12 | Migración y RLS en Supabase | `feat/comments` | RF-33 | pendiente |
| T13 | Adaptador, Actions y Turnstile | `feat/comments` | RF-26, RF-27, RF-33 | pendiente |
| T14 | Interfaz de comentarios | `feat/comments` | RF-24, RF-28 a RF-32 | pendiente |
| T15 | Puerta de calidad y revisión independiente | `chore/launch` | Aceptación | pendiente |
| T16 | Renombrar repositorio y desplegar | `chore/launch` | Aceptación | pendiente |

## Necesita a Luis

| Cuándo | Qué |
|---|---|
| T5 | Revisar en navegador la sensación del fondo y el movimiento |
| T12 | Aprobar el proyecto nuevo de Supabase |
| T13 | Crear cuenta de Cloudflare y el widget de Turnstile |
| T16 | Aprobar push, PR, renombre y despliegue |
| Cuando exista | Enviar el dibujo de su hija para el logo |

## Retoma

1. Lee esta tabla y busca la primera tarea sin `validada`.
2. Cambia a su rama, o créala desde la rama anterior.
3. Lee los requisitos citados en `spec.md`.
4. Ejecuta `npm run test`, `npm run lint` y `npm run build` antes de seguir.

## Registro

| Fecha | Nota |
|---|---|
| 2026-11-07 | Artefactos anteriores eliminados con aprobación de Luis |
| 2026-11-07 | T1 a T10 implementadas; revisión independiente: 7 hallazgos corregidos y verificados en navegador. Pasan a `validada` tras la revisión final de T15 |
| 2026-11-07 | Astro 7 usa Sätteri: los plugins remark exigen otra dependencia. La fecha de edición se lee desde git en `getStaticPaths` |
| 2026-11-07 | Siguiente: T11, dominio de comentarios. T12 y T13 esperan cuentas de Luis |
| 2026-11-07 | Ajustes de Luis: nombre One.Bemore, icono y dibujo de su hija, paleta rosada, sin esquinas redondeadas, rastro táctil, barra reactiva, pie solo en inicio |
| 2026-11-08 | T11 detenida tras 3 intentos: la revisión final pide 2 cambios importantes (enlace con www contado doble; fila contradictoria en plan.md) y 9 sugerencias. Esperando decisión de Luis |
| 2026-11-08 | T11 validada: revisión independiente con Opus APROBADO en la cuarta ronda, con 72 tests. Pendiente para T12: marca de autor del servidor contra suplantación con letras parecidas |
| 2026-11-08 | Rediseño minimalista por feedback de los primeros lectores: una fuente, paleta mínima, inicio plegado, tarjetas, archivo con Ver más, viaje entre páginas. Rama `feat/minimal-redesign` |
