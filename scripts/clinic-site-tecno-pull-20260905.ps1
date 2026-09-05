$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$backup = 'C:\Users\TemichevVet\TemichevVet\backups\manual-releases\clinic-site-20260905-b0e182f'
if (-not (Test-Path (Join-Path $backup 'database.dump'))) { throw 'Verified backup required' }
$dockerConfig = Join-Path $backup 'docker-client'
New-Item -ItemType Directory -Path $dockerConfig -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $dockerConfig 'config.json'), '{"auths":{"ghcr.io":{}},"credsStore":""}', (New-Object System.Text.UTF8Encoding($false)))
$version = 'b0e182fe3e2a1fe0461e920a27d5f2d50311bdc0'
foreach ($component in @('api','web')) {
  $image = "ghcr.io/pivotemnoe/kliniksrm-${component}:$version"
  docker --config $dockerConfig pull $image
  if ($LASTEXITCODE -ne 0) { throw "Image pull failed: $component" }
  $info = docker image inspect $image | ConvertFrom-Json
  if ($info.Architecture -ne 'amd64' -or $info.Config.Labels.'org.opencontainers.image.revision' -ne $version) { throw "Image verification failed: $component" }
  Write-Output "Verified image: $image"
}
