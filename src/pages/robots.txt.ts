import type { APIContext } from 'astro';

// Se genera para que el sitemap apunte siempre al dominio configurado.
export function GET({ site }: APIContext) {
  const sitemap = new URL('sitemap-index.xml', site);
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
