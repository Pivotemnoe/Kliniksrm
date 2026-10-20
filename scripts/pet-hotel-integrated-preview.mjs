// Real clinic processor and gateway on synthetic databases; all external transport blocked.
import { createServer, request as forward } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { configureIntegratedHotel, prepareIntegratedHotelDb, integratedHotelFixture, integratedGateway, integratedPassword } from '../tests/helpers/pet-hotel-integrated-qa.mjs';
const names = configureIntegratedHotel(true);
await prepareIntegratedHotelDb(names);
const f = await integratedHotelFixture(names), g = await integratedGateway(names, 4333);
await f.hotel.setupRooms('integrated-qa-room-names-v2',f.staff.director);
await f.app.listen(4332, '127.0.0.1');
for (const owner of f.owners) await g.ownerCookie(owner);
const invite = randomBytes(32).toString('hex');
await g.prisma.portalInvitation.create({ data: { ownerId: f.owners[0].id, tokenHash: createHash('sha256').update(invite).digest('hex'), channel: 'WEB', expiresAt: new Date(Date.now() + 86400000) } });
process.env.PET_HOTEL_CRM_SYNC_ENABLED = 'true';
await f.sync.syncNow();
const timer = setInterval(() => void f.sync.syncNow(), 3000);
const root = resolve('apps/web/dist'), mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  if (!['127.0.0.1:4331', 'localhost:4331'].includes(req.headers.host)) { res.writeHead(403); res.end(); return; }
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path.startsWith('/api/')) {
    const headers = { ...req.headers, host: '127.0.0.1:4332' }; delete headers['x-temichevvet-remote-access']; delete headers['x-temichevvet-gateway-secret'];
    const proxy = forward({ hostname: '127.0.0.1', port: 4332, path: req.url, method: req.method, headers }, reply => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
    proxy.on('error', () => { res.writeHead(502); res.end('Local QA API unavailable'); }); req.pipe(proxy); return;
  }
  try {
    let file = resolve(root, '.' + decodeURIComponent(path)); if (!file.startsWith(root + sep) && file !== root) throw Error();
    let data; try { data = await readFile(file); } catch { if (extname(path) && !path.endsWith('.html')) { res.writeHead(404); res.end(); return; } file = resolve(root, 'index.html'); data = await readFile(file); }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(4331, '127.0.0.1', resolve));
const output = 'output/pet-hotel-integrated-20261020'; await mkdir(output, { recursive: true });
await writeFile(output + '/preview-access.json', JSON.stringify({ mode: 'REAL_CLINICAL_PROCESSOR_SYNTHETIC_DATA_NO_EXTERNAL_DELIVERY', crm: 'http://127.0.0.1:4331/pet-hotel', director: f.staff.director.email, operator: f.staff.pet_hotel_operator.email, password: integratedPassword, gateway: g.origin, portal: g.origin + '/portal/pet-hotel', activate: g.origin + '/portal?token=' + invite, ownerId: f.owners[0].id, animalId: f.owners[0].animal.id }, null, 2), { mode: 0o600 });
console.log('Integrated hotel preview: CRM4331, API4332, gateway4333. Real processor; synthetic data only; MAX blocked.');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { clearInterval(timer); server.closeAllConnections(); server.close(); await g.close(); await f.close(); process.exit(0); });
