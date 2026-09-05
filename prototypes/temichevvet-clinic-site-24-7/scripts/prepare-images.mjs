import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from '/Users/konstantin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs';
const source = path.resolve('../../outputs/temichevvet-design-directions-2026-09-05/assets');
const target = path.resolve('public/images');
await fs.mkdir(target, { recursive: true });
await fs.mkdir('public/fonts', { recursive: true });
for (const name of await fs.readdir(source)) {
  if (name.endsWith('.woff2')) await fs.copyFile(path.join(source, name), path.join('public/fonts', name));
  if (!name.endsWith('.jpg')) continue;
  for (const width of [640, 1280]) {
    await sharp(path.join(source, name)).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 84 }).toFile(path.join(target, name.replace('.jpg', `-${width}.webp`)));
  }
}
console.log('Real clinic photographs resized and encoded; original content unchanged.');
