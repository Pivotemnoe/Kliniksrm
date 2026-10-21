[CmdletBinding()]
param([string]$PackageRoot=$PSScriptRoot)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($PSVersionTable.PSVersion.Major -ne 5){throw 'Windows PowerShell 5.1 is required'}
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PackageRoot 'release-api.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw ('Syntax errors: '+($errors|Out-String))}
foreach($name in @('Invoke-ReleaseDocker','Hash','Json','Atomic','Save','Assert-Compose','New-Configuration','Restore-Configuration','Assert-Protected')){
  $function=$ast.Find({param($node)$node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
  if(-not $function){throw ('Missing function: '+$name)}
  . ([scriptblock]::Create($function.Extent.Text))
}
$temp=Join-Path $env:TEMP ('hotel-sync-release-qa-'+[guid]::NewGuid().ToString('N'));$oldPath=$env:PATH
try{
  $Root=Join-Path $temp 'root';$backup=Join-Path $temp 'backup';$statePath=Join-Path $backup 'api-state.json'
  $null=New-Item -ItemType Directory -Path $Root,$backup,(Join-Path $Root 'diagnostics/bin') -Force
  $stub="@echo off`r`nif `"%~1`"==`"fail`" (`r`n echo synthetic deliberate error 1>&2`r`n exit /b 17`r`n)`r`necho synthetic benign warning 1>&2`r`necho SYNTHETIC_OK`r`nexit /b 0`r`n"
  [IO.File]::WriteAllText((Join-Path $temp 'docker.cmd'),$stub,[Text.Encoding]::ASCII);$env:PATH=$temp+';'+$oldPath
  if((Get-Command docker).Source -ne (Join-Path $temp 'docker.cmd')){throw 'Docker stub isolation failed'}
  if((Invoke-ReleaseDocker @('ok')) -notmatch 'SYNTHETIC_OK'){throw 'Native stderr warning was not handled'}
  $rejected=$false;try{$null=Invoke-ReleaseDocker @('fail')}catch{$rejected=$true};if(-not $rejected){throw 'Nonzero native exit code accepted'}
  $manifest=[pscustomobject]@{revision=('b'*40);candidate=[pscustomobject]@{reference='synthetic:new'}}
  $before=ConvertFrom-Json -InputObject '{"name":"test","services":{"api":{"image":"synthetic:old","container_name":"clinic-crm-api","environment":{"SEED_ON_START":"false","CRM_SOURCE_VERSION":"old","KEEP":"preserve"}},"web":{"image":"web:unchanged"}},"volumes":{"data":{}}}'
  $after=ConvertFrom-Json -InputObject ($before|ConvertTo-Json -Depth 20);$after.services.api.image=$manifest.candidate.reference;$after.services.api.environment.CRM_SOURCE_VERSION=$manifest.revision
  Assert-Compose $before $after
  $after.services.api.environment.KEEP='changed';$rejected=$false;try{Assert-Compose $before $after}catch{$rejected=$true};if(-not $rejected){throw 'Unrelated API setting accepted'};$after.services.api.environment.KEEP='preserve'
  $after.services.web.image='changed';$rejected=$false;try{Assert-Compose $before $after}catch{$rejected=$true};if(-not $rejected){throw 'Web change accepted'}
  $texts=@{'.env'="TEMICHEVVET_API_IMAGE=synthetic:old`r`nTEMICHEVVET_REMOTE_API_IMAGE=synthetic:old`r`nCRM_SOURCE_VERSION=old`r`nKEEP=preserve`r`n";'.env.runtime'="LICENSE_SETTING=synthetic-preserve`n";'docker-compose.yml'="services: {}`n";'diagnostics/bin/system-diagnostics-config.json'='{"expectedRevision":"old","expectedApiImage":"synthetic:old","expectedWebRevision":"web-old","expectedWebImage":"web:unchanged"}'}
  $configuration=@()
  foreach($name in $texts.Keys){$file=Join-Path $Root $name;$encoding=New-Object Text.UTF8Encoding($name -eq '.env');$bytes=[byte[]](@($encoding.GetPreamble())+@($encoding.GetBytes($texts[$name])));[IO.File]::WriteAllBytes($file,$bytes);$saved='before-'+$name.Replace('/','-');[IO.File]::WriteAllBytes((Join-Path $backup $saved),$bytes);$configuration+=[pscustomobject]@{name=$name;sha256=(Hash $file);savedName=$saved;appliedHash=''}}
  $state=[pscustomobject]@{configuration=$configuration};New-Configuration $state
  $envLines=[IO.File]::ReadAllLines((Join-Path $Root '.env'));if('TEMICHEVVET_API_IMAGE=synthetic:new' -notin $envLines -or 'KEEP=preserve' -notin $envLines -or ('CRM_SOURCE_VERSION='+$manifest.revision) -notin $envLines){throw 'API pin change failed'}
  $d=Json (Join-Path $Root 'diagnostics/bin/system-diagnostics-config.json');if($d.expectedRevision -ne $manifest.revision -or $d.expectedWebRevision -ne 'web-old' -or $d.expectedWebImage -ne 'web:unchanged'){throw 'Diagnostics separation failed'}
  $changed=Join-Path $Root '.env';[IO.File]::AppendAllText($changed,'UNRELATED=changed');$rejected=$false;try{Restore-Configuration $state}catch{$rejected=$true};if(-not $rejected){throw 'Rollback overwrote an unrelated configuration edit'}
  $item=@($configuration|Where-Object{$_.name -eq '.env'})[0];Atomic $changed ([IO.File]::ReadAllBytes((Join-Path $backup ('planned-'+$item.savedName))))
  Restore-Configuration $state
  foreach($item in $configuration){if((Hash (Join-Path $Root $item.name)) -ne $item.sha256){throw 'Rollback did not preserve exact original bytes and BOM'}}
  $script:fake=[pscustomobject]@{Id='one';Image='sha256:one';State=[pscustomobject]@{StartedAt='start';Running=$true}}
  function Container([string]$Name){return $script:fake}
  $protected=@([pscustomobject]@{name='synthetic';id='one';image='sha256:one';started='start'});Assert-Protected $protected
  $script:fake.Image='sha256:other';$rejected=$false;try{Assert-Protected $protected}catch{$rejected=$true};if(-not $rejected){throw 'Protected service change accepted'}
  [pscustomobject]@{passed=$true;parser='Windows PowerShell 5.1';nativeStderr=$true;composeScope=$true;exactConfigurationRollback=$true;concurrentEditRefused=$true;protectedServiceGuard=$true;productionDockerAccess=$false}|ConvertTo-Json
}finally{$env:PATH=$oldPath;if(Test-Path $temp){Remove-Item -LiteralPath $temp -Recurse -Force}}
