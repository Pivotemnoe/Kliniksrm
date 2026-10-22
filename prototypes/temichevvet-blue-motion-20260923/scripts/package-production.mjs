import { mkdir, cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { routeTitles } from '../src/content.js';

// Reproducible public-only artifact; local previews keep their noindex policy.
const destination = resolve(process.argv[2] || '');
if (!destination.includes('/outputs/clinic-site-release-20260923/')) throw Error('Explicit release output required');
await mkdir(destination, {recursive:false});
await cp('dist/client', destination, {recursive:true, filter: path => !/\.(?:md|map)$/.test(path) && !/\/assets\/.*\.png$/.test(path) && !path.endsWith('/anatomy-dog-muscles.webp')});
const base='https://clinic.temichevvet.ru';
// A public release must not silently ship a dead contact button again.
const jsFiles = (await readdir(join(destination, 'assets'))).filter(name => name.endsWith('.js'));
const publicJs = (await Promise.all(jsFiles.map(name => readFile(join(destination, 'assets', name), 'utf8')))).join('\n');
if (!publicJs.includes('VITE_CLINIC_CHAT_LEADS_ENABLED:"true"') || !publicJs.includes('https://clinic.temichevvet.ru/privacy')) {
  throw Error('Public callback configuration missing from compiled bundle; release blocked');
}
for(const route of Object.keys(routeTitles)) {
  const file=join(destination,route,'index.html');
  let html=await readFile(file,'utf8');
  if(!html.includes('content="noindex,nofollow"')) throw Error('Missing preview robots marker');
  html=html.replace('content="noindex,nofollow"','content="index,follow"').replace('</head>',`<link rel="canonical" href="${base}${route}" /></head>`);
  await writeFile(file,html);
}
await writeFile(join(destination,'robots.txt'),`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /v1/\nDisallow: /internal/\nSitemap: ${base}/sitemap.xml\n`);
await writeFile(join(destination,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(routeTitles).map(route=>`<url><loc>${base}${route}</loc></url>`).join('')}</urlset>\n`);
const manifest=[];
async function scan(dir,prefix='') {
  for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const rel=prefix+entry.name, path=join(dir,entry.name);
    if(entry.isDirectory()) await scan(path,rel+'/');
    else manifest.push(createHash('sha256').update(await readFile(path)).digest('hex')+'  '+rel);
  }
}
await scan(destination);
await writeFile(join(destination,'SHA256SUMS'),manifest.join('\n')+'\n');
console.log(JSON.stringify({destination,pages:Object.keys(routeTitles).length,files:manifest.length}));
