import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist/client');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (pathname === '/v1/public/clinic/catalog') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ status: 'unavailable', currency: 'RUB', items: [], updatedAt: null })); return;
  }
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + '/') && file !== root) { res.writeHead(403); res.end(); return; }
  try { if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch {}
  let status = 200; let body;
  try { body = await fs.readFile(file); } catch { file = path.join(root, '404.html'); body = await fs.readFile(file); status = 404; }
  res.writeHead(status, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(4192, '127.0.0.1', () => console.log('Clinic 24/7 local preview: http://127.0.0.1:4192'));
