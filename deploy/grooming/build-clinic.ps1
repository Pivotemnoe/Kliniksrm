[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ActorId,
  [string]$PackagePath=$PSScriptRoot
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4') { throw 'Wrong clinic host' }
function Invoke-GroomingDocker([string[]]$Arguments) {
  $saved=$ErrorActionPreference
  try { $ErrorActionPreference='Continue';$value=& docker @Arguments 2>&1|Out-String;$code=$LASTEXITCODE } finally { $ErrorActionPreference=$saved }
  if($code -ne 0){throw "Docker $($Arguments[0]) failed: $value"};return $value
}
$source=Get-Content (Join-Path $PackagePath 'source.json') -Raw|ConvertFrom-Json
$previous=@{}
foreach($name in @('api','web')) {
  $container=@(ConvertFrom-Json (Invoke-GroomingDocker -Arguments @('inspect',('clinic-crm-'+$name))))[0]
  $expected=if($name -eq 'api'){'sha256:0a0fbea021e28a6b704a4ec9c03f85fae7ee05aa15827eef790fe42c05063c60'}else{'sha256:fe0cbe0e5a9d08bae729d7e5068b2d71234d99e62316dc0d49f0c08771e267e8'}
  if($container.Image -ne $expected){throw "Coordinated baseline changed: $name"}
  $previous[$name]=@{reference=$container.Config.Image;id=$container.Image}
}
$images=@{}
foreach($name in @('api','web')) {
  $reference='temichevvet-crm-'+$name+':grooming-integration-20261019-r1'
  $log=Invoke-GroomingDocker -Arguments @('build','--platform','linux/amd64','--network','none','--pull=false','--build-arg',('GROOMING_SOURCE_REVISION='+$source.revision),'-f',(Join-Path $PackagePath ('Dockerfile.'+$name)),'-t',$reference,$PackagePath)
  [IO.File]::WriteAllText((Join-Path $PackagePath ($name+'-build.log')),$log)
  $image=@(ConvertFrom-Json (Invoke-GroomingDocker -Arguments @('image','inspect',$reference)))[0]
  if($image.Architecture -ne 'amd64' -or $image.Config.Labels.'org.opencontainers.image.revision' -ne $source.revision){throw "Candidate identity differs: $name"}
  $images[$name]=@{reference=$reference;id=$image.Id}
}
$hasher="const f=require('fs'),p=require('path'),c=require('crypto'),o={};function w(d){for(const e of f.readdirSync(d,{withFileTypes:true})){const n=p.join(d,e.name);if(e.isDirectory())w(n);else if(e.isFile())o[n]=c.createHash('sha256').update(f.readFileSync(n)).digest('hex');}}w('/app/apps/api/dist');console.log(JSON.stringify(o));"
$old=ConvertFrom-Json (Invoke-GroomingDocker -Arguments @('run','--rm','--platform','linux/amd64','--network','none','--entrypoint','node',$previous.api.id,'-e',$hasher))
$new=ConvertFrom-Json (Invoke-GroomingDocker -Arguments @('run','--rm','--platform','linux/amd64','--network','none','--entrypoint','node',$images.api.reference,'-e',$hasher))
$protected=0
foreach($property in $old.PSObject.Properties) {
  if($property.Name -match '/dist/(app\.module\.js$|modules/(grooming|clinic-modules)/)'){continue}
  $protected++
  if(-not $new.PSObject.Properties[$property.Name] -or $new.PSObject.Properties[$property.Name].Value -ne $property.Value){throw "Unrelated clinical runtime changed: $($property.Name)"}
}
foreach($property in $new.PSObject.Properties) {
  if(-not $old.PSObject.Properties[$property.Name] -and $property.Name -notmatch '/dist/modules/(grooming|clinic-modules)/'){throw "Unexpected clinical runtime file: $($property.Name)"}
}
$manifest=@{releaseId=$source.releaseId;revision=$source.revision;actorId=$ActorId;previous=$previous;images=$images;protectedApiFiles=$protected;acceptedStockRevision=$source.acceptedStockRevision}
[IO.File]::WriteAllText((Join-Path $PackagePath 'release.json'),($manifest|ConvertTo-Json -Depth 9),(New-Object Text.UTF8Encoding($false)))
Write-Output 'BUILD_OK: exact clinic baseline retained; grooming images and release manifest qualified.'
