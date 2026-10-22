import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile, stat} from 'node:fs/promises';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = join(project, 'public');
const hotelRoot = join(publicRoot, 'pet-hotel');
const site = 'https://pet.temichevvet.ru';
const pages = ['index.html', 'journal/choose-a-stay.html', 'journal/familiar-things.html', 'journal/first-visit.html'];
const codeFiles = ['app.js', 'articles.js', 'booking.js', 'rates.js', 'style.css'];
const icons = ['favicon.svg', 'favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png'];
const photos = [
  'hotel-cat-premium.jpg', 'hotel-dog-premium.jpg',
  'hotel-rooms-4814.jpg', 'hotel-glass-4812.jpg', 'hotel-inside-4817-clean.jpg',
  'salon-real-4806-retouched.jpg',
  ...Array.from({length: 6}, (_, i) => `guest-${i + 1}.jpg`),
];
const sharedAssets = ['manrope-cyrillic.woff2', 'manrope-latin.woff2', 'temichevvet-logo.jpg'];
const sha256 = data => createHash('sha256').update(data).digest('hex');

export async function buildHotelRelease({destination, releaseId, revision, builtAt = new Date().toISOString(), sourceDirty = false}) {
  if (!destination || !/^[a-z0-9][a-z0-9-]{4,100}$/.test(releaseId || '') || !/^[a-f0-9]{40}$/.test(revision || '')) throw Error('Invalid release metadata');
  if (!Number.isFinite(Date.parse(builtAt))) throw Error('Invalid build timestamp');
  // An existing directory is immutable. The caller must choose a fresh build path.
  await mkdir(destination, {recursive: false});
  const root = join(destination, 'pet-hotel');
  await mkdir(join(root, 'journal'), {recursive: true});
  await mkdir(join(root, 'assets'), {recursive: true});
  const files = {};
  const put = async (name, data) => {
    if (name.startsWith('/') || name.split('/').includes('..')) throw Error('Invalid release path');
    await writeFile(join(root, name), data);
    files[name] = sha256(data);
  };
  for (const name of pages) {
    let html = await readFile(join(hotelRoot, name), 'utf8');
    const logo = relative(dirname(name), 'assets/temichevvet-logo.jpg').replaceAll('\\', '/');
    html = html.replace(/(?:\.\.\/)+assets\/temichevvet-logo\.jpg/g, logo)
      .replace(/<meta name="robots" content="noindex,nofollow">/g, '')
      .replace(/<span class="preview-label">Локальный просмотр<\/span>/g, '')
      .replaceAll('http://127.0.0.1:4275/', '/');
    const canonical = site + '/pet-hotel/' + (name === 'index.html' ? '' : name);
    html = html.replace('</head>', `<link rel="canonical" href="${canonical}"></head>`);
    if (/http:\/\/(?:127\.0\.0\.1|localhost)|Локальный просмотр|noindex,nofollow/.test(html)) throw Error('Local preview content in public HTML: ' + name);
    await put(name, html);
  }
  for (const name of codeFiles) {
    let data = await readFile(join(hotelRoot, name), 'utf8');
    if (name === 'style.css') data = data.replaceAll("url('../assets/manrope-", "url('assets/manrope-");
    await put(name, data);
  }
  await put('booking-attribution.js', await readFile(join(project, '../../packages/booking-attribution/browser.mjs')));
  for (const name of icons) await put(name, await readFile(join(hotelRoot, name)));
  for (const name of photos) await put('assets/' + name, await readFile(join(hotelRoot, 'assets', name)));
  for (const name of sharedAssets) await put('assets/' + name, await readFile(join(publicRoot, 'assets', name)));
  const locations = pages.map(name => site + '/pet-hotel/' + (name === 'index.html' ? '' : name));
  await put('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.map(loc => `<url><loc>${loc}</loc></url>`).join('')}</urlset>\n`);
  const release = {
    releaseId, revision, builtAt, sourceDirty,
    site: site + '/pet-hotel/', ownerPortal: 'https://cabinet.temichevvet.ru/portal/pet-hotel',
    gatewayContract: 1, fixturesIncluded: false,
    files,
  };
  await writeFile(join(root, 'release.json'), JSON.stringify(release, null, 2) + '\n');
  return {root, release, fileCount: Object.keys(files).length + 1};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: project, encoding: 'utf8'}).trim();
  const trackedChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: project, encoding: 'utf8'}).trim();
  const releaseId = process.env.PET_HOTEL_RELEASE_ID || `pet-hotel-site-20261020-${revision.slice(0, 12)}`;
  const dist = join(project, 'dist');
  await mkdir(dist, {recursive: true});
  const result = await buildHotelRelease({destination: join(dist, releaseId), releaseId, revision, sourceDirty: !!trackedChanges});
  const size = (await Promise.all(Object.keys(result.release.files).map(name => stat(join(result.root, name))))).reduce((total, item) => total + item.size, 0);
  process.stdout.write(JSON.stringify({releaseId, revision, sourceDirty: !!trackedChanges, root: result.root, files: result.fileCount, bytes: size}) + '\n');
}
