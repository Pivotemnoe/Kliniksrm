import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const projectRoot = new URL('../', import.meta.url);
const execFileAsync = promisify(execFile);

async function read(relativePath) {
  return readFile(new URL(relativePath, projectRoot), 'utf8');
}

test('Mac-обновление существующей CRM меняет только api и web', async () => {
  const [installer, starter] = await Promise.all([
    read('scripts/portable/install-mac.sh'),
    read('scripts/start-clinic-server.sh'),
  ]);

  assert.match(installer, /capture_existing_infrastructure/);
  assert.match(installer, /docker container inspect clinic-crm-postgres clinic-crm-redis clinic-crm-minio/);
  assert.match(installer, /com\.docker\.compose\.project\.working_dir/);
  assert.match(installer, /COMPOSE_PROJECT_NAME="\$EXISTING_COMPOSE_PROJECT"/);
  assert.match(installer, /docker tag "\$POSTGRES_IMAGE_ID" postgres:16-alpine/);
  assert.match(installer, /if ! docker load --input "\$IMAGES_TAR"; then[\s\S]*restore_existing_infrastructure_tags/);
  assert.match(installer, /TEMICHEVVET_API_IMAGE=temichevvet-api:local/);
  assert.match(installer, /TEMICHEVVET_WEB_IMAGE=temichevvet-web:local/);
  assert.match(installer, /start-clinic-server\.sh" --app-only --open --no-image-update/);
  assert.match(installer, /normalize_windows_scripts_for_mac/);
  assert.match(installer, /sub\(\/\^\\357\\273\\277\//);
  assert.doesNotMatch(installer, /chmod \+x "\$INSTALL_DIR"\/scripts\/\*\.sh/);

  assert.match(starter, /--app-only/);
  assert.match(starter, /docker_compose up -d --no-build --no-deps --force-recreate api web/);
  assert.match(starter, /PostgreSQL, Redis, MinIO, backup-контейнер и Docker volumes не перезапускаются/);
});

test('быстрая запись на флешку не заменяет рабочий комплект до полной проверки', async () => {
  const writer = await read('scripts/write-ready-portable-to-flash.sh');

  assert.match(writer, /TMP_TARGET="\$DESTINATION\/TemichevVet-Portable\.tmp"/);
  assert.match(writer, /rsync -rlt/);
  assert.match(writer, /cleanup_macos_metadata "\$READY_DIR"/);
  assert.match(writer, /xattr -cr "\$target"/);
  assert.match(writer, /shasum -a 256 -c temichevvet-images\.tar\.sha256/);
  assert.match(writer, /SOURCE_FILE_COUNT/);
  assert.ok(writer.indexOf('mv "$TARGET" "$BACKUP"') > writer.indexOf('shasum -a 256 -c'));
  assert.match(writer, /rm -f "\$directory"\/\._\*/);
});

test('быстрая запись действительно проверяет копию перед переключением папок', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'temichevvet-flash-writer-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(sandbox, { recursive: true, force: true });
  });
  const ready = join(sandbox, 'ready');
  const destination = join(sandbox, 'flash');
  const current = join(destination, 'TemichevVet-Portable');
  await mkdir(join(ready, 'docker-images'), { recursive: true });
  await mkdir(join(ready, 'portable'), { recursive: true });
  await mkdir(current, { recursive: true });

  const archive = Buffer.from('portable-image-fixture');
  const archiveHash = createHash('sha256').update(archive).digest('hex');
  await Promise.all([
    writeFile(join(ready, 'VERSION.txt'), 'git_commit=test-safe-writer\n'),
    writeFile(join(ready, 'docker-images', 'temichevvet-images.tar'), archive),
    writeFile(join(ready, 'docker-images', 'temichevvet-images.tar.sha256'), `${archiveHash}  temichevvet-images.tar\n`),
    writeFile(join(ready, 'portable', 'install-windows.ps1'), '# windows\n'),
    writeFile(join(ready, 'portable', 'install-mac.sh'), '#!/usr/bin/env bash\n'),
    writeFile(join(ready, 'Обновить TemichevVet - Windows.bat'), '@echo off\r\n'),
    writeFile(join(ready, 'Обновить TemichevVet - Mac.command'), '#!/usr/bin/env bash\n'),
    writeFile(join(current, 'old-marker.txt'), 'old\n'),
  ]);

  await execFileAsync('bash', ['scripts/write-ready-portable-to-flash.sh', destination], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, READY_DIR: ready },
  });

  assert.equal(await readFile(join(current, 'VERSION.txt'), 'utf8'), 'git_commit=test-safe-writer\n');
  const entries = await readdir(destination);
  const backupName = entries.find((entry) => entry.startsWith('TemichevVet-Portable.old-'));
  assert.ok(backupName, 'предыдущий комплект должен сохраниться под резервным именем');
  assert.equal(await readFile(join(destination, backupName, 'old-marker.txt'), 'utf8'), 'old\n');
  assert.equal(entries.some((entry) => entry === 'TemichevVet-Portable.tmp'), false);
});

test('Windows-обновление проверяет архив, архитектуру и делает backup до загрузки образов', async () => {
  const [installer, starter, onlineUpdater] = await Promise.all([
    read('scripts/portable/install-windows.ps1'),
    read('scripts/start-clinic-server.ps1'),
    read('scripts/update-clinic-server.ps1'),
  ]);

  assert.match(installer, /Backup-CurrentDatabase/);
  assert.match(installer, /Assert-ImagesArchiveChecksum/);
  assert.match(installer, /Assert-WindowsImageArchitecture "temichevvet-api:local"/);
  assert.match(installer, /Assert-WindowsImageArchitecture "temichevvet-web:local"/);
  assert.ok(installer.indexOf('Backup-CurrentDatabase') < installer.lastIndexOf('Invoke-Native -Command "docker" -Arguments @("load"'));
  assert.doesNotMatch(installer, /docker\s+(?:volume\s+rm|compose\s+down\s+--volumes|system\s+prune)/i);
  assert.match(installer, /Test-DockerContainerRunning "clinic-crm-postgres"/);
  assert.match(installer, /& \$starter -Open -AppOnly -NoImageUpdate/);
  assert.match(onlineUpdater, /@\("-AppOnly", "-NoImageUpdate"\)/);
  assert.match(starter, /@\("compose", "up", "-d", "--no-build", "--no-deps", "--force-recreate", "api", "web"\)/);

  const removeApplicationStart = starter.indexOf('function Remove-ApplicationContainers');
  const removeApplicationEnd = starter.indexOf('function Start-ComposeServices', removeApplicationStart);
  const removeApplicationBlock = starter.slice(removeApplicationStart, removeApplicationEnd);
  assert.doesNotMatch(removeApplicationBlock, /clinic-crm-(?:postgres|redis|minio)/);
});

test('сборщик Windows-комплекта проверяет именно amd64-варианты без дублей', async () => {
  const creator = await read('scripts/create-portable-flash.sh');

  assert.match(creator, /git -C "\$ROOT_DIR" archive --format=tar HEAD \| tar -xf - -C "\$TMP_DIR\/CRM"/);
  assert.match(creator, /xattr -cr "\$target"/);
  assert.match(creator, /Настроить диск для резервного хранения - Windows\.bat/);
  assert.doesNotMatch(creator, /Настроить отдельный диск резервных копий - Windows\.bat/);
  assert.match(creator, /docker compose config --images \| sort -u/);
  assert.match(creator, /docker image inspect --platform "\$PLATFORM" "\$image"/);
  assert.match(creator, /docker image inspect --platform "\$PLATFORM" --format '\{\{\.Id\}\}'/);
  assert.match(creator, /docker save --platform "\$PLATFORM"/);
});
