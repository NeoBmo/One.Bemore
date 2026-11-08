import { defineConfig, fontProviders } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// La URL definitiva llega con el despliegue: SITE_URL la sobrescribe.
export default defineConfig({
  site: process.env.SITE_URL || 'https://one-bmore-blog.workers.dev',
  integrations: [mdx(), sitemap()],
  redirects: { '/about': '/sobre-mi/' },
  // El tema por variables deja los colores del código en manos de prose.css.
  markdown: { shikiConfig: { theme: 'css-variables' } },
  compressHTML: true,
  // Tres voces: Quattro para leer, JetBrains Mono para datos y controles,
  // Shantell Sans para títulos escritos a mano.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'iA Writer Quattro',
      cssVariable: '--font-reading',
      weights: [400, 700],
      styles: ['normal', 'italic'],
      subsets: ['latin'],
      fallbacks: ['serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'JetBrains Mono',
      cssVariable: '--font-mono',
      weights: [400, 700],
      styles: ['normal', 'italic'],
      subsets: ['latin'],
      fallbacks: ['monospace'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Shantell Sans',
      cssVariable: '--font-hand',
      weights: [400, 700],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['cursive'],
    },
  ],
});
