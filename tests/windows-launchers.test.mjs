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
    assert.match(source, /(?:\[IO\.File\]::AppendAllText|IO\.StreamWriter)/);
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

test('установка и обновление Windows запрашивают административные права для узкого правила сети', async () => {
  const launchers = await Promise.all([
    readProjectFile('scripts/portable/start-windows.bat'),
    readProjectFile('scripts/portable/update-windows.bat'),
  ]);

  for (const source of launchers) {
    assert.match(source, /fltmc >nul 2>&1/i);
    assert.match(source, /Start-Process[\s\S]*-Verb RunAs/i);
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
  assert.match(installer, /& \$starter -Open -AppOnly -NoImageUpdate/);
});

test('чистая Windows-установка публикует только веб-интерфейс в локальную сеть', async () => {
  const [installer, compose] = await Promise.all([
    readProjectFile('scripts/portable/install-windows.ps1'),
    readProjectFile('docker-compose.yml'),
  ]);

  assert.match(installer, /Set-InstalledEnvValue "WEB_BIND_ADDR" "0\.0\.0\.0"/);
  assert.match(compose, /\$\{WEB_BIND_ADDR:-127\.0\.0\.1\}:\$\{WEB_PORT:-3000\}:80/);
  assert.match(compose, /127\.0\.0\.1:\$\{API_HOST_PORT:-4000\}:4000/);
  assert.match(compose, /127\.0\.0\.1:\$\{POSTGRES_PORT:-5433\}:5432/);
  assert.match(compose, /127\.0\.0\.1:\$\{REDIS_PORT:-6379\}:6379/);
  assert.match(compose, /127\.0\.0\.1:\$\{MINIO_API_PORT:-9000\}:9000/);
  assert.match(installer, /New-NetFirewallRule[\s\S]*-LocalPort \$WebPort[\s\S]*-RemoteAddress LocalSubnet[\s\S]*-Profile Private/);
  assert.match(installer, /Docker Desktop Backend/);
  assert.match(installer, /Set-NetFirewallRule -Name \$dockerRule\.Name -Profile Public/);
});

test('portable LAN repair only republishes web and preserves stateful services', async () => {
  const repair = await readProjectFile('scripts/portable/repair-clinic-lan-windows.ps1');
  const launcher = await readProjectFile('scripts/portable/repair-clinic-lan-windows.bat');
  const builder = await readProjectFile('scripts/create-portable-flash.sh');

  assert.match(repair, /Set-InstalledEnvValue -Key "WEB_BIND_ADDR" -Value "0\.0\.0\.0"/);
  assert.match(repair, /RemoteAddress LocalSubnet/);
  assert.match(repair, /Profile Private/);
  assert.match(repair, /docker compose up -d --no-deps --force-recreate web/);
  assert.doesNotMatch(repair, /docker compose down/);
  assert.doesNotMatch(repair, /docker volume/);
  assert.match(launcher, /repair-clinic-lan-windows\.ps1/);
  assert.match(builder, /Исправить доступ с рабочих мест - Windows\.bat/);
});

test('portable bundle exposes a clear create-workstation command and keeps the old alias', async () => {
  const builder = await readProjectFile('scripts/create-portable-flash.sh');

  assert.match(builder, /Создать рабочее место - Windows\.bat/);
  assert.match(builder, /Подключить рабочее место - Windows\.bat/);
  assert.match(builder, /start-workstation-windows\.bat/);
});

test('Windows restore refreshes the installed transfer script from the flash drive', async () => {
  const restoreLauncher = await readProjectFile('scripts/portable/restore-transfer-windows.bat');

  assert.match(restoreLauncher, /PORTABLE_SCRIPT=%~dp0CRM\\scripts\\restore-clinic-transfer\.ps1/);
  assert.match(restoreLauncher, /copy \/Y "%PORTABLE_SCRIPT%" "%INSTALLED_SCRIPT%"/);
  assert.match(restoreLauncher, /copy \/Y "%PORTABLE_START_SCRIPT%" "%INSTALLED_START_SCRIPT%"/);
  assert.match(restoreLauncher, /актуальный скрипт восстановления с флешки/);
});

test('Windows launcher and portable installer update .env without loading the whole file into memory', async () => {
  const starter = await readProjectFile('scripts/start-clinic-server.ps1');
  const installer = await readProjectFile('scripts/portable/install-windows.ps1');

  for (const source of [starter, installer]) {
    assert.doesNotMatch(source, /Get-Content \$(?:EnvFile|InstalledEnvFile) -Raw/);
    assert.match(source, /IO\.StreamReader/);
    assert.match(source, /\[IO\.File\]::Copy\(\$tempEnvFile, \$(?:EnvFile|InstalledEnvFile), \$true\)/);
  }
});

test('чистая Windows-установка тихо проверяет ещё не созданные Docker-объекты', async () => {
  const installer = await readProjectFile('scripts/portable/install-windows.ps1');

  assert.match(installer, /function Test-DockerCommand/);
  assert.match(installer, /\$ErrorActionPreference = "SilentlyContinue"/);
  assert.match(installer, /return Test-DockerCommand -Arguments @\("container", "inspect", \$Container\)/);
  assert.doesNotMatch(installer, /docker container inspect clinic-crm-postgres \*> \$null/);
});
