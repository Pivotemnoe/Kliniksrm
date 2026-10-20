// Fixed local frontend builds. Both upstreams are existing synthetic QA services.
// No production URL, Avito API, model, MAX or push transport is available here.
import { createServer, request as proxyRequest } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const reviewRoot = '/Users/konstantin/Documents/CRM/output/design/module-style-20261020';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const services = [
  { port: 4281, upstream: 4271, dir: 'apps/web/dist', label: 'CRM / груминг', cookie: 'crm_style_main_' },
  { port: 4282, upstream: 4300, dir: 'apps/web/dist', label: 'Авито', cookie: 'crm_style_avito_', avito: true },
  { port: 4283, upstream: 4271, dir: 'apps/web/dist-grooming', label: 'Кабинет грумера', cookie: 'crm_style_groomer_' },
  { port: 4284, upstream: 4273, dir: 'apps/owner-gateway/public', label: 'Кабинет владельца', cookie: 'crm_style_owner_', owner: true },
];

function rewriteCookies(value, prefix) {
  return String(value || '').split(';').map(part => part.trim()).filter(part => part.startsWith(prefix)).map(part => part.slice(prefix.length)).join('; ');
}
function forward(req, res, service) {
  const target = `127.0.0.1:${service.upstream}`;
  const headers = { ...req.headers, host: target, cookie: rewriteCookies(req.headers.cookie, service.cookie) };
  if (headers.origin) headers.origin = `http://${target}`;
  if (headers.referer) headers.referer = `http://${target}/`;
  const proxy = proxyRequest({ hostname: '127.0.0.1', port: service.upstream, path: req.url, method: req.method, headers }, upstream => {
    const responseHeaders = { ...upstream.headers };
    if (responseHeaders['set-cookie']) responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map(value => service.cookie + value);
    res.writeHead(upstream.statusCode || 502, responseHeaders); upstream.pipe(res);
  });
  proxy.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'Локальный тестовый API недоступен. Данные не отправлялись на внешний сервер.' })); });
  req.on('aborted', () => proxy.destroy()); req.pipe(proxy);
}

const servers = [];
const metrics = Object.fromEntries(services.map(service => [service.port, { documents: 0, apiRequests: 0 }]));
for (const service of services) {
  const directory = await realpath(resolve(root, service.dir));
  const server = createServer(async (req, res) => {
    if (req.headers.host !== `127.0.0.1:${service.port}`) { res.writeHead(403); res.end(); return; }
    res.setHeader('Cache-Control', 'private, no-store');
    const pathname = new URL(req.url || '/', `http://127.0.0.1:${service.port}`).pathname;
    if (pathname === '/__qa/metrics') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(metrics)); return; }
    if (pathname === '/__qa/report' || /^\/__qa\/screens\/[a-z0-9-]+\.png$/.test(pathname)) {
      try {
        const name = pathname === '/__qa/report' ? 'index.html' : `screens/${pathname.split('/').pop()}`;
        res.writeHead(200, { 'Content-Type': types[extname(name)] || 'text/plain' }); res.end(await readFile(resolve(reviewRoot, name)));
      } catch { res.writeHead(404); res.end(); }
      return;
    }
    if (service.owner && pathname === '/__qa/owner') {
      try {
        const session = JSON.parse(await readFile(resolve(root, '.artifacts/style-owner-session.json'), 'utf8'));
        if (session.mode !== 'SYNTHETIC_MODULE_STYLE' || session.cookieName !== 'grooming_integration_owner') throw new Error('Unexpected fixture');
        res.writeHead(302, { 'Set-Cookie': `${service.cookie}${session.cookieName}=${session.token}; Path=/; HttpOnly; SameSite=Strict`, Location: '/portal/grooming' }); res.end();
      } catch { res.writeHead(503); res.end('Synthetic owner fixture is not prepared'); }
      return;
    }
    if (service.avito && pathname.startsWith('/__qa/role/')) {
      const role = pathname.split('/').pop();
      if (!['director', 'administrator', 'doctor'].includes(role)) { res.writeHead(404); res.end(); return; }
      res.writeHead(302, { 'Set-Cookie': `${service.cookie}avito_qa_role=${role}; Path=/; HttpOnly; SameSite=Strict`, Location: '/avito' }); res.end(); return;
    }
    if (service.avito && pathname === '/__qa') {
      res.writeHead(200, { 'Content-Type': types['.html'] }); res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Локальная приёмка Авито</title><h1>Синтетическая проверка Авито</h1><p>Реальная отправка и публикации недоступны. Выберите тестовую роль:</p><ul><li><a href="/__qa/role/director">Директор</a></li><li><a href="/__qa/role/administrator">Администратор</a></li><li><a href="/__qa/role/doctor">Врач — проверка запрета доступа</a></li></ul></html>'); return;
    }
    if (pathname.startsWith('/api/') || (service.owner && (pathname.startsWith('/v1/') || pathname.startsWith('/portal/activate')))) { metrics[service.port].apiRequests++; forward(req, res, service); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    try {
      let relative = decodeURIComponent(pathname);
      if (service.owner) relative = relative.startsWith('/portal/') ? relative.slice('/portal'.length) : relative;
      let file = resolve(directory, `.${relative}`);
      if (file !== directory && !file.startsWith(directory + sep)) { res.writeHead(403); res.end(); return; }
      if (!(await stat(file).catch(() => null))?.isFile()) {
        if (extname(relative)) { res.writeHead(404); res.end(); return; }
        file = resolve(directory, service.owner && pathname.startsWith('/portal/grooming') ? 'grooming.html' : 'index.html');
      }
      const canonical = await realpath(file);
      if (!canonical.startsWith(directory + sep)) { res.writeHead(403); res.end(); return; }
      if (extname(file) === '.html') metrics[service.port].documents++;
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : await readFile(canonical));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(service.port, '127.0.0.1', ok); });
  servers.push(server);
  console.log(`${service.label}: http://127.0.0.1:${service.port}`);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const server of servers) { server.closeAllConnections(); server.close(); } process.exit(0); });
