import { defineConfig, envField, fontProviders } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

// La URL definitiva llega con el despliegue: SITE_URL la sobrescribe.
export default defineConfig({
  site: process.env.SITE_URL || 'https://one-bmore-blog.workers.dev',
  integrations: [mdx(), sitemap()],
  redirects: { '/about': '/sobre-mi/' },
  // El tema por variables deja los colores del código en manos de prose.css.
  markdown: { shikiConfig: { theme: 'css-variables' } },
  compressHTML: true,
  // Una sola fuente para todo el sitio: homogénea y fácil de leer.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'iA Writer Quattro',
      cssVariable: '--font-reading',
      weights: [400, 700],
      styles: ['normal', 'italic'],
      subsets: ['latin'],
      fallbacks: ['sans-serif'],
    },
  ],
  // Las páginas siguen siendo estáticas; solo las acciones de comentarios corren en el Worker.
  // Las imágenes se procesan en el build, y no hay sesiones: así el Worker no pide
  // servicios extra de Cloudflare (Images y KV) que el blog no usa.
  adapter: cloudflare({ imageService: 'compile' }),
  session: false,
  // Variables del servidor. «secret» significa que se leen al atender cada petición,
  // nunca se copian al build. Opcionales: sin ellas los comentarios quedan «no disponibles».
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPABASE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      TURNSTILE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      COMMENT_TOKEN_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      IP_HASH_SALT: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});