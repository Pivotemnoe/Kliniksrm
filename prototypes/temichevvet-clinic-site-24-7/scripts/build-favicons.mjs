// Mechanical size/format conversion of the existing clinic logo; no redraw.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
const source = 'public/brand/temichevvet-logo.jpg';
for (const [size, name] of [[32, 'temichevvet-favicon-32'], [192, 'temichevvet-favicon-192'], [180, 'temichevvet-apple-touch-icon']]) {
  execFileSync('/usr/bin/sips', ['-s', 'format', 'png', '-z', String(size), String(size), source, '--out', `public/brand/${name}.png`], { stdio: 'inherit' });
}
// ICO container with an embedded PNG, also serving legacy /favicon.ico requests.
const png = await fs.readFile('public/brand/temichevvet-favicon-32.png');
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header[6] = 32; header[7] = 32;
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
await fs.writeFile('public/favicon.ico', Buffer.concat([header, png]));
