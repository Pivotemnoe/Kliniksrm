import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webSource = path.join(root, 'apps', 'web', 'src');
const wrapperPath = path.join(webSource, 'shared', 'ui', 'DecimalInputNumber.tsx');

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  }));
  return nested.flat();
}

test('все числовые поля принимают десятичную запятую и точку через единый компонент', async () => {
  const wrapper = await readFile(wrapperPath, 'utf8');
  const files = (await listFiles(webSource)).filter((file) => file.endsWith('.tsx'));
  const sources = await Promise.all(files.map(async (file) => ({ file, source: await readFile(file, 'utf8') })));
  const consumers = sources.filter(({ source }) => source.includes('<InputNumber'));
  const inputCount = consumers.reduce((total, { source }) => total + (source.match(/<InputNumber/g)?.length ?? 0), 0);

  assert.equal(consumers.length, 18);
  assert.equal(inputCount, 52);
  assert.ok(wrapper.includes("replace(/[\\s\\u00a0]/g, '').replace(/,/g, '.')"));
  assert.ok(wrapper.includes("inputMode={inputMode ?? 'decimal'}"));
  assert.match(wrapper, /parser=\{parser \?\?/);

  for (const { file, source } of consumers) {
    assert.match(source, /DecimalInputNumber/, `${path.relative(root, file)} обходит единый десятичный ввод`);
  }

  for (const { file, source } of sources) {
    if (file === wrapperPath) continue;
    assert.doesNotMatch(
      source,
      /import \{[^\n]*\bInputNumber\b[^\n]*\} from 'antd'/,
      `${path.relative(root, file)} импортирует InputNumber напрямую`,
    );
  }
});

test('нормализация не меняет точку и преобразует запятую', () => {
  const normalize = (value) => value.replace(/[\s\u00a0]/g, '').replace(/,/g, '.');

  assert.equal(normalize('0,5'), '0.5');
  assert.equal(normalize('0.5'), '0.5');
  assert.equal(normalize('1 234,56'), '1234.56');
  assert.equal(normalize('-0,25'), '-0.25');
});
