import fs from 'node:fs/promises';
import path from 'node:path';
import { render } from '../dist/ssr/entry-server.js';
import { routes, pageMeta, clinic } from '../src/content.js';
const base = process.env.SITE_ORIGIN || 'https://clinic.temichevvet.ru';
const publishable = process.env.SITE_INDEXABLE === 'true';
const root = 'dist/client';
const template = await fs.readFile(`${root}/index.html`, 'utf8');
const escape = str => str.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
for (const route of [...routes, '/photo-plan', '/404']) {
  const meta = pageMeta[route] || [route === '/photo-plan' ? 'План фотографий' : 'Страница не найдена', 'TemichevVET'];
  const hidden = !publishable || !pageMeta[route];
  const structured = JSON.stringify({ '@context': 'https://schema.org', '@type': 'VeterinaryCare', name: clinic.name, url: base, telephone: '+79284214542', address: { '@type': 'PostalAddress', addressLocality: 'Армавир', streetAddress: 'ул. Каспарова, 27/2', addressCountry: 'RU' }, openingHours: 'Mo-Su 00:00-24:00', sameAs: [clinic.maps] }).replaceAll('<', '\\u003c');
  const html = template.replace('<!--ssr-outlet-->', render(route))
    .replace(/<title>.*?<\/title>/, `<title>${escape(meta[0])} — TemichevVET</title>`)
    .replace(/<meta name="description"[^>]+>/, `<meta name="description" content="${escape(meta[1])}">`)
    .replace(/<meta name="robots"[^>]+>/, `<meta name="robots" content="${hidden ? 'noindex,nofollow' : 'index,follow'}">`)
    .replace('</head>', `<link rel="canonical" href="${base}${route === '/' ? '/' : route}"><meta property="og:title" content="${escape(meta[0])} — TemichevVET"><meta property="og:description" content="${escape(meta[1])}"><meta property="og:type" content="website"><meta property="og:locale" content="ru_RU"><meta property="og:url" content="${base}${route}"><meta property="og:image" content="${base}/images/facade-real-1280.webp"><script type="application/ld+json">${structured}</script></head>`);
  const file = route === '/404' ? `${root}/404.html` : path.join(root, route, 'index.html');
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, html);
}
await fs.writeFile(`${root}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(r => `<url><loc>${base}${r}</loc></url>`).join('')}</urlset>`);
await fs.writeFile(`${root}/robots.txt`, publishable ? `User-agent: *\nDisallow: /photo-plan\nSitemap: ${base}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
console.log(`Prerendered ${routes.length} public routes, photo plan and 404. Indexable: ${publishable}`);
