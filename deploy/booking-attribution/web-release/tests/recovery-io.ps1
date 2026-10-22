param([Parameter(Mandatory=$true)][string]$Publisher)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($Publisher,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Publisher parse failed'}
$needed=@('Get-Hash','Write-WebBytesAtomic','Write-WebTextAtomic','Save-WebState','Set-WebPin','Restore-Configuration')
foreach($name in $needed){
 $functions=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)|Where-Object{$_.Name -eq $name})
 if($functions.Count -ne 1){throw 'Expected one source function'}
 . ([scriptblock]::Create($functions[0].Extent.Text))
}
$journalTry=@($ast.EndBlock.Statements|Where-Object{$_ -is [Management.Automation.Language.TryStatementAst] -and $_.Body.Extent.Text.Contains('Save-WebState $statePath $state')})
if($journalTry.Count -ne 1){throw 'Expected one guarded journal write'}
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('codex-web-recovery-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory $scratch
try{
 $Root=Join-Path $scratch 'live';$BackupPath=Join-Path $scratch 'backup'
 $null=New-Item -ItemType Directory $Root;$null=New-Item -ItemType Directory $BackupPath
 $Compose=Join-Path $Root 'docker-compose.yml';[IO.File]::WriteAllText($Compose,'synthetic-compose')
 $composeHash=Get-Hash $Compose
 $live=Join-Path $Root '.env';$savedName='before.env'
 [IO.File]::WriteAllText($live,"OTHER=kept`nTEMICHEVVET_WEB_IMAGE=qa-web:old`n",(New-Object Text.UTF8Encoding($true)))
 [IO.File]::WriteAllBytes((Join-Path $BackupPath $savedName),[IO.File]::ReadAllBytes($live))
 $beforeHash=Get-Hash $live
 $envFiles=@([pscustomobject]@{name='.env';savedName=$savedName;beforeHash=$beforeHash;appliedHash='';kind='env'})
 $state=[pscustomobject]@{root=$Root;candidateId='synthetic-new-image';envFiles=$envFiles;composeHash=$composeHash}
 $script:Manifest=[pscustomobject]@{images=[pscustomobject]@{web=[pscustomobject]@{candidate='qa-web:new'}}}
 $statePath=Join-Path $scratch 'missing-parent/state.json'
 $failed=$false
 try{Invoke-Expression $journalTry[0].Extent.Text}catch{
  if($_.Exception.GetBaseException() -isnot [IO.DirectoryNotFoundException]){throw}
  $failed=$true
 }
 if(-not $failed -or (Get-Hash $live) -ne $beforeHash){throw 'Journal failure did not restore exact configuration'}
 if(@(Get-ChildItem -LiteralPath $Root -Filter '*.codex-web-*.tmp').Count){throw 'Atomic temporary file leaked'}
 $statePath=Join-Path $scratch 'saved-state.json';Save-WebState $statePath $state
 $read=Get-Content -LiteralPath $statePath -Raw -Encoding UTF8|ConvertFrom-Json
 if($read.root -ne $Root -or $read.composeHash -ne $composeHash){throw 'Journal readback failed'}
 $journalHash=Get-Hash $statePath;$refused=$false
 try{Save-WebState $statePath $state}catch{$refused=$true}
 if(-not $refused -or (Get-Hash $statePath) -ne $journalHash){throw 'Existing journal was overwritten'}
 Set-WebPin $live 'qa-web:new';$state.envFiles[0].appliedHash=Get-Hash $live
 [IO.File]::AppendAllText($Compose,'-foreign-port-change')
 $changedHash=Get-Hash $live;$refused=$false
 try{Restore-Configuration $state}catch{
  if($_.Exception.Message -notlike '*Compose changed*'){throw};$refused=$true
 }
 if(-not $refused -or (Get-Hash $live) -ne $changedHash){throw 'Compose drift failed to stop config rollback'}
 @{passed=4;failed=0;actualPublisherFunctions=$true;journalFailureRestoresExactConfig=$true;atomicJournalReadback=$true;existingJournalPreserved=$true;composeDriftRefused=$true;productionAccessed=$false;dockerCalled=$false}|ConvertTo-Json
}finally{if(Test-Path -LiteralPath $scratch){Remove-Item -LiteralPath $scratch -Recurse -Force}}
