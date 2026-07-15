# Blog RockOraboloco

Blog personal centrado en aprendizaje, autodidactismo y mejora continua.

## Historia breve

Este proyecto nacio como un blog personal para documentar ideas, aprendizajes y procesos de crecimiento tecnico y personal. La version activa se desarrolla desde la identidad actual de GitHub, `NeoBmo`, pero la publicacion final mantiene el repositorio historico que conserva la integracion con Netlify y el historial publico del sitio.

## Filosofia de diseno

- Minimalista y editorial.
- Foco en legibilidad, jerarquia tipografica y ritmo visual.
- Animacion funcional, no decorativa.
- Contenido primero, interfaz al servicio del texto.
- Experiencia responsiva con una sola linea visual consistente.

## Tecnologias utilizadas

- Astro 6
- TypeScript
- Tailwind CSS 4
- MDX
- RSS con `@astrojs/rss`
- Sitemap con `@astrojs/sitemap`
- GSAP, reservado para animaciones puntuales del sitio

## Caracteristicas principales

- Generacion estatica.
- Sistema de blog basado en colecciones de contenido.
- SEO base con metadatos Open Graph, Twitter Cards y sitemap.
- Navegacion simple y rapida.
- Diseno responsive con soporte para pantallas pequenas y grandes.
- Animaciones ligeras y controladas.
- RSS disponible para sindicacion.

## Estructura del proyecto

```text
src/
  content/
    blog/          Articulos del blog en Markdown o MDX
    config.ts      Esquema de contenido
  components/      Componentes reutilizables
  layouts/         Layouts de paginas y articulos
  pages/           Rutas publicas
  styles/          Estilos globales
  ui/              Piezas de UI aisladas
  utils/           Funciones de dominio y helpers
public/            Activos estaticos
dist/              Salida generada por build
```

## Instalacion

```bash
npm install
```

## Scripts disponibles

- `npm run dev` - inicia el servidor de desarrollo.
- `npm run start` - alias de desarrollo.
- `npm run lint` - ejecuta `astro check`.
- `npm run build` - genera la version de produccion.
- `npm run preview` - previsualiza el build localmente.
- `npm run astro` - acceso directo al CLI de Astro.

## Metricas relevantes

- Build estatica: completada sin errores.
- `astro check`: 0 errores, 0 warnings, 0 hints.
- Rutas generadas: 6 paginas publicas.
- Tamano total del artefacto `dist/`: 86,829 bytes.
- Sitio optimizado para entrega liviana, sin runtime complejo en cliente.

## Estado actual

Estado del proyecto: listo para preproduccion.

Puntos validos para la release actual:

- `npm run build` finaliza correctamente.
- `npm run lint` esta disponible y pasa con `astro check`.
- No hay errores de tipos o de plantillas en Astro.
- No se detectaron comentarios de desarrollo obsoletos ni imports no usados en el analisis actual.

## Roadmap

- Unificar y depurar el uso de GSAP para dejar solo animaciones realmente necesarias.
- Reducir dependencias que no aporten valor directo al sitio.
- Mejorar microinteracciones sin aumentar el costo de render.
- Ampliar el sistema editorial con mejores plantillas para articulos.
- Seguir reforzando accesibilidad semantica y contraste.
- Revisar la estrategia de imagenes y metadatos por articulo.

## Despliegue

- Build orientado a Netlify.
- Salida estatica en `dist/`.
- Sitemap y RSS generados en build.
- La variable `SITE_URL` puede usarse para ajustar el dominio publico en `astro.config.mjs`.

## Version 2.0

La version 2.0 representa un rediseno completo del blog con foco en solidez de publicacion y limpieza arquitectonica.

- Rediseno completo de la experiencia visual.
- Optimizacion del sistema de animaciones para mantenerlas sutiles y controladas.
- Eliminacion de componentes innecesarios y simplificacion de la estructura.
- Mejoras de rendimiento en la capa estatica y en la carga inicial.
- Ajustes responsive para mantener consistencia en desktop y mobile.
- Mejoras SEO y accesibilidad en metadatos, semantica y navegacion.
- Preparacion para despliegue en Netlify con salida estatica reproducible.

## Licencia

Proyecto personal. Uso privado salvo que se indique lo contrario.
