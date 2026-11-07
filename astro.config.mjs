import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// La URL definitiva llega con el despliegue: SITE_URL la sobrescribe.
export default defineConfig({
  site: process.env.SITE_URL || 'https://one-bmore-blog.workers.dev',
  integrations: [mdx(), sitemap()],
  compressHTML: true,
});
