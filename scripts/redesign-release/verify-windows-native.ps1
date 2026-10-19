[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -ne 5){throw 'This check requires the installed Windows PowerShell 5.1'}
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'release-web.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Release script syntax error'}
$function=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Invoke-Docker'},$true)
if(-not $function){throw 'Docker invocation function is missing'}
. ([scriptblock]::Create($function.Extent.Text))
$temp=Join-Path $env:TEMP ('crm-redesign-native-test-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $temp
$oldPath=$env:PATH
try {
  $stub=@'
@echo off
if "%~1"=="fail" (
  echo synthetic deliberate error 1>&2
  exit /b 17
)
echo synthetic benign warning 1>&2
echo SYNTHETIC_OK
exit /b 0
'@
  [IO.File]::WriteAllText((Join-Path $temp 'docker.cmd'),$stub,[Text.Encoding]::ASCII)
  $env:PATH=$temp+';'+$oldPath
  if((Get-Command docker).Source -ne (Join-Path $temp 'docker.cmd')){throw 'Synthetic command isolation failed'}
  $output=Invoke-Docker -Arguments @('ok')
  if($output -notmatch 'SYNTHETIC_OK' -or $ErrorActionPreference -ne 'Stop'){throw 'Native warning handling failed'}
  $rejected=$false
  try {$null=Invoke-Docker -Arguments @('fail')}
  catch {if($_.Exception.Message -notmatch 'Docker command failed'){throw};$rejected=$true}
  if(-not $rejected){throw 'A failing native exit code must remain fatal'}
  Write-Output 'NATIVE_STDERR_VERIFIED: benign warning accepted; nonzero exit rejected; no Docker services accessed.'
} finally {$env:PATH=$oldPath;Remove-Item -LiteralPath $temp -Recurse -Force}
