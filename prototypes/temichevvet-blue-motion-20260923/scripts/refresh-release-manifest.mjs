import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] || '');
if (!root.includes('/outputs/clinic-site-release-20260923/')) {
  throw new Error('Explicit clinic release output required');
}
const entries = [];
async function visit(directory, prefix = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'SHA256SUMS') continue;
    const relative = prefix + entry.name;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path, relative + '/');
    else entries.push(`${createHash('sha256').update(await readFile(path)).digest('hex')}  ${relative}`);
  }
}
await visit(root);
await writeFile(join(root, 'SHA256SUMS'), entries.join('\n') + '\n');
console.log(JSON.stringify({ root, files: entries.length }));
