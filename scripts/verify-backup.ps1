param(
  [Parameter(Mandatory = $true)]
  [string]$Archive
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
if (!(Test-Path $Archive -PathType Leaf)) { throw "Архив не найден: $Archive" }
$Archive = (Resolve-Path $Archive).Path
$statusFile = Join-Path (Split-Path $Archive) "restore-test.status"
$temp = Join-Path ([IO.Path]::GetTempPath()) "TemichevVet-verify-$([Guid]::NewGuid().ToString('N'))"
$container = "temichevvet-restore-test-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
$containerStarted = $false

Write-Host "Цель действия: проверить восстановление копии в одноразовой временной базе."
Write-Host "Архив: $Archive"
Write-Host "Рабочая база и Docker volumes клиники не изменяются и не удаляются."
New-Item -ItemType Directory -Path $temp | Out-Null

$archiveChecksum = "$Archive.sha256"
if (Test-Path $archiveChecksum -PathType Leaf) {
  $expectedHash = ((Get-Content $archiveChecksum -First 1) -split '\s+')[0].ToLowerInvariant()
  $actualHash = (Get-FileHash $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expectedHash -ne $actualHash) { throw "Контрольная сумма архива не совпала. Проверка остановлена." }
}
try {
  & tar.exe -xzf $Archive -C $temp
  if ($LASTEXITCODE -ne 0) { throw "Архив не распакован." }
  $dump = Get-ChildItem $temp -Recurse -Filter "postgres.dump" | Select-Object -First 1
  $innerChecksum = Get-ChildItem $temp -Recurse -Filter "SHA256SUMS" | Select-Object -First 1
  if ($innerChecksum) {
    $checksumRoot = Split-Path $innerChecksum.FullName
    foreach ($line in Get-Content $innerChecksum.FullName) {
      $parts = $line -split '\s+', 2
      if ($parts.Count -ne 2) { continue }
      $candidate = Join-Path $checksumRoot $parts[1].Trim().Replace('/', '\')
      if (!(Test-Path $candidate -PathType Leaf) -or (Get-FileHash $candidate -Algorithm SHA256).Hash.ToLowerInvariant() -ne $parts[0].ToLowerInvariant()) {
        throw "Внутренняя контрольная сумма не совпала: $($parts[1])"
      }
    }
  }

  if (!$dump) {
    $files = @(Get-ChildItem $temp -File -Recurse)
    $totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
    [IO.File]::WriteAllText($statusFile, "state=ok`nchecked_at=$((Get-Date).ToUniversalTime().ToString('o'))`nkind=files`nfiles=$($files.Count)`nbytes=$totalBytes`n", $Utf8NoBom)
    Write-Host "Проверка файлов пройдена. Архив распакован, файлов: $($files.Count)."
    return
  }

  docker image inspect postgres:16-alpine *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Локальный образ postgres:16-alpine не найден. Сначала запустите установленную CRM; проверка не будет скачивать образ из интернета автоматически."
  }

  docker run -d --name $container -e POSTGRES_DB=restore_test -e POSTGRES_USER=restore_test -e POSTGRES_PASSWORD=restore_test postgres:16-alpine *> $null
  if ($LASTEXITCODE -ne 0) { throw "Не удалось запустить временную PostgreSQL." }
  $containerStarted = $true
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    docker exec $container pg_isready -U restore_test -d restore_test *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (!$ready) { throw "Временная PostgreSQL не стала готова за 60 секунд." }
  docker cp $dump.FullName "$container`:/tmp/postgres.dump"
  docker exec $container pg_restore -U restore_test -d restore_test --no-owner --no-privileges /tmp/postgres.dump
  if ($LASTEXITCODE -ne 0) { throw "Копия не восстановилась во временную базу." }
  $ownerCount = docker exec $container psql -U restore_test -d restore_test -At -c 'SELECT count(*) FROM "Owner";'
  if ($LASTEXITCODE -ne 0) { throw "Восстановленная база не прошла контрольный запрос." }
  [IO.File]::WriteAllText($statusFile, "state=ok`nchecked_at=$((Get-Date).ToUniversalTime().ToString('o'))`nkind=database`nowners=$ownerCount`n", $Utf8NoBom)
  Write-Host "Проверка пройдена. Временная база прочитана, владельцев: $ownerCount."
} catch {
  [IO.File]::WriteAllText($statusFile, "state=failed`nchecked_at=$((Get-Date).ToUniversalTime().ToString('o'))`n", $Utf8NoBom)
  throw
} finally {
  if ($containerStarted) { docker rm -f $container *> $null }
  if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
