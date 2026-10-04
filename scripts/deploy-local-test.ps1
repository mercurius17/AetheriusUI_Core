param(
  [string]$TestRoot = 'C:\Code\Aetherius-MP-Teste',
  [string]$Mo2 = 'C:\modOrganizer',
  [string]$SourceProfile = 'AETHERIUS - GRAFICO - QUALIDADE',
  [string]$TestProfile = 'AETHERIUS UI - TESTE LOCAL'
)
$ErrorActionPreference = 'Stop'
$package = Join-Path $TestRoot 'packages\Aetherius UI - Core Test'
$manifest = Get-Content -LiteralPath (Join-Path $package 'artifact-manifest.json') -Raw | ConvertFrom-Json
foreach ($file in $manifest.files) {
  $asset = Join-Path $package $file.path
  if ((Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw "Artifact hash mismatch: $asset" }
}
$modName = 'Aetherius UI - Core Test'
$modPath = [IO.Path]::GetFullPath((Join-Path $Mo2 "mods\$modName"))
$allowedMod = [IO.Path]::GetFullPath((Join-Path $Mo2 'mods')) + [IO.Path]::DirectorySeparatorChar
if (-not $modPath.StartsWith($allowedMod, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe mod destination' }
if (Test-Path -LiteralPath $modPath) {
  if (-not (Test-Path -LiteralPath (Join-Path $modPath 'aetherius-core-test-owner.txt'))) { throw 'Existing mod is not owned by this test deployment' }
}
New-Item -ItemType Directory -Force -Path $modPath | Out-Null
# Retire only files previously installed by this owned package and removed from
# its new manifest. All paths must resolve inside this exact mod directory.
$previousManifestPath = Join-Path $modPath 'artifact-manifest.json'
if (Test-Path -LiteralPath $previousManifestPath) {
  $previous = Get-Content -LiteralPath $previousManifestPath -Raw | ConvertFrom-Json
  $currentPaths = @($manifest.files.path)
  foreach ($file in $previous.files) {
    if (-not $file.path.StartsWith('Data/') -or $currentPaths -contains $file.path) { continue }
    $retired = [IO.Path]::GetFullPath((Join-Path $modPath $file.path.Substring(5)))
    if (-not $retired.StartsWith($modPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe retired asset path' }
    if (Test-Path -LiteralPath $retired -PathType Leaf) { Remove-Item -LiteralPath $retired -Force }
  }
}
Copy-Item -Path (Join-Path $package 'Data\*') -Destination $modPath -Recurse -Force
[IO.File]::WriteAllText((Join-Path $modPath 'aetherius-core-test-owner.txt'), 'AetheriusUI_Core local validation package')
Copy-Item -LiteralPath (Join-Path $package 'artifact-manifest.json') -Destination (Join-Path $modPath 'artifact-manifest.json') -Force
$profile = Join-Path $Mo2 "profiles\$TestProfile"
$source = Join-Path $Mo2 "profiles\$SourceProfile"
if (-not (Test-Path -LiteralPath $profile)) {
  New-Item -ItemType Directory -Path $profile | Out-Null
  foreach ($name in @('modlist.txt', 'plugins.txt', 'loadorder.txt')) { Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $profile $name) }
  $gameIni = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'My Games\Skyrim Special Edition'
  foreach ($name in @('Skyrim.ini', 'SkyrimPrefs.ini', 'SkyrimCustom.ini')) {
    $profileIni = Join-Path $source $name
    $globalIni = Join-Path $gameIni $name
    if (Test-Path -LiteralPath $profileIni) { Copy-Item -LiteralPath $profileIni -Destination (Join-Path $profile $name) }
    elseif (Test-Path -LiteralPath $globalIni) { Copy-Item -LiteralPath $globalIni -Destination (Join-Path $profile $name) }
  }
  [IO.File]::WriteAllText((Join-Path $profile 'settings.ini'), "[General]`r`nLocalSaves=true`r`nLocalSettings=true`r`nAutomaticArchiveInvalidation=true`r`n")
  New-Item -ItemType Directory -Path (Join-Path $profile 'saves') | Out-Null
  [IO.File]::WriteAllText((Join-Path $profile 'aetherius-core-test-owner.txt'), 'Dedicated profile; no original saves copied.')
} elseif (-not (Test-Path -LiteralPath (Join-Path $profile 'aetherius-core-test-owner.txt'))) { throw 'Existing profile is not owned by this test deployment' }
$modlist = Join-Path $profile 'modlist.txt'
$lines = [IO.File]::ReadAllLines($modlist) | Where-Object { $_ -ne "+$modName" -and $_ -ne "-$modName" }
[IO.File]::WriteAllLines($modlist, @("+$modName") + $lines, [Text.UTF8Encoding]::new($false))
$backup = Join-Path $TestRoot 'backups\mo2-before-core-test.ini'
New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
if (-not (Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath (Join-Path $Mo2 'ModOrganizer.ini') -Destination $backup }
"Deployed $modPath; enabled only in profile $TestProfile. Original profile and saves preserved."
