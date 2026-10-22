import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {buildHotelRelease} from '../prototypes/temichevvet-pet-hotel-20261020/scripts/build-release.mjs';

test('hotel public package is self-contained, excludes local/private sources, and preserves hashes', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'pet-hotel-site-release-'));
  t.after(() => rm(temporary, {recursive: true, force: true}));
  const result = await buildHotelRelease({destination: join(temporary, 'release'), releaseId: 'hotel-qa-release', revision: 'a'.repeat(40), builtAt: '2026-10-20T17:00:00.000Z'});
  const names = (await readdir(result.root, {recursive: true})).filter(name => /\.[a-z0-9]+$/i.test(name));
  assert.equal(result.release.sourceDirty, false);
  assert.equal(result.release.fixturesIncluded, false);
  assert.ok(!names.some(name => /HEIC|\.env|preview-access|salon-real-4808|hotel-inside-4817\.jpg|serve\.mjs|SKILL|AGENTS|SOURCE_PHOTOS/i.test(name)));
  for (const [name, expected] of Object.entries(result.release.files)) {
    const data = await readFile(join(result.root, name));
    assert.equal(createHash('sha256').update(data).digest('hex'), expected, name);
  }
  assert.equal(names.length, Object.keys(result.release.files).length + 1);
  for (const name of names.filter(name => name.endsWith('.html'))) {
    const html = await readFile(join(result.root, name), 'utf8');
    assert.doesNotMatch(html, /http:\/\/(?:127\.0\.0\.1|localhost)|Локальный просмотр|noindex/);
    assert.match(html, /rel="canonical" href="https:\/\/pet\.temichevvet\.ru\/pet-hotel\//);
    const url = new URL(name, 'https://pet.temichevvet.ru/pet-hotel/');
    for (const [, link] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const target = new URL(link, url);
      if (target.origin !== url.origin || !target.pathname.startsWith('/pet-hotel/')) continue;
      let local = target.pathname.slice('/pet-hotel/'.length);
      if (!local || local.endsWith('/')) local += 'index.html';
      await readFile(join(result.root, local));
    }
  }
  const style = await readFile(join(result.root, 'style.css'), 'utf8');
  for (const [, name] of style.matchAll(/url\('([^']+)'\)/g)) await readFile(join(result.root, name));
  // Static ES module dependencies must ship alongside their importers.
  for (const name of names.filter(name => name.endsWith('.js'))) {
    const code = await readFile(join(result.root, name), 'utf8');
    for (const [, link] of code.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
      const target = new URL(link, new URL(name, 'https://pet.temichevvet.ru/pet-hotel/'));
      assert.ok(target.pathname.startsWith('/pet-hotel/'), `${name}: module outside release`);
      await readFile(join(result.root, target.pathname.slice('/pet-hotel/'.length)));
    }
  }
  const index = await readFile(join(result.root, 'index.html'), 'utf8');
  assert.match(index, /assets\/salon-real-4806-retouched\.jpg/);
  assert.match(index, /Наш салон груминга/);
  assert.match(index, /Визуализация номера/);
  assert.match(await readFile(join(result.root, 'app.js'), 'utf8'), /HotelBooking/);
});

test('release builder refuses to overwrite existing artifacts or accept unsafe metadata', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'pet-hotel-site-safety-'));
  t.after(() => rm(temporary, {recursive: true, force: true}));
  const existing = join(temporary, 'existing');
  await mkdir(existing); await writeFile(join(existing, 'marker'), 'preserve');
  await assert.rejects(buildHotelRelease({destination: existing, releaseId: 'hotel-qa-existing', revision: 'a'.repeat(40)}), /EEXIST/);
  assert.equal(await readFile(join(existing, 'marker'), 'utf8'), 'preserve');
  await assert.rejects(buildHotelRelease({destination: join(temporary, 'unsafe'), releaseId: '../unsafe', revision: 'a'.repeat(40)}), /Invalid release metadata/);
});
