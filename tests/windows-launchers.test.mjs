import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../', import.meta.url);

async function readProjectFile(relativePath) {
  return readFile(new URL(relativePath, projectRoot), 'utf8');
}

test('Windows-скрипты сохраняют конфигурацию в UTF-8 без BOM', async () => {
  const [launcher, installer] = await Promise.all([
    readProjectFile('scripts/start-clinic-server.ps1'),
    readProjectFile('scripts/portable/install-windows.ps1'),
  ]);

  for (const source of [launcher, installer]) {
    assert.match(source, /New-Object System\.Text\.UTF8Encoding(?:\(\$false\)| -ArgumentList \$false)/);
    assert.match(source, /\[IO\.File\]::WriteAllText/);
    assert.match(source, /\[IO\.File\]::AppendAllText/);
  }
});

test('готовые Windows-команды переключают консоль на UTF-8', async () => {
  const launchers = await Promise.all([
    readProjectFile('scripts/portable/start-windows.bat'),
    readProjectFile('scripts/portable/update-windows.bat'),
    readProjectFile('scripts/portable/update-online-windows.bat'),
    readProjectFile('scripts/portable/check-version-windows.bat'),
  ]);

  for (const source of launchers) {
    assert.match(source, /chcp 65001 >nul/i);
  }
});

test('Windows-запуск не зависит от возможности перезаписать защищённый .env', async () => {
  const [launcher, updater, installer, batch] = await Promise.all([
    readProjectFile('scripts/start-clinic-server.ps1'),
    readProjectFile('scripts/update-clinic-server.ps1'),
    readProjectFile('scripts/portable/install-windows.ps1'),
    readProjectFile('start-temichevvet-windows.bat'),
  ]);

  for (const source of [launcher, updater, installer]) {
    assert.match(source, /\.env\.runtime/);
    assert.match(source, /UnauthorizedAccessException/);
    assert.match(source, /SetEnvironmentVariable\([^\n]+"Process"\)/);
  }

  assert.match(batch, /-NoImageUpdate/);
  assert.doesNotMatch(installer, /cmd \/c "`"\$launcher`" -ForceRecreate -NoImageUpdate"/);
  assert.match(installer, /& \$starter -Open -ForceRecreate -NoImageUpdate/);
});
