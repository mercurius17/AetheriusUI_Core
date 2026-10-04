param([string]$TestRoot = 'C:\Code\Aetherius-MP-Teste')
$ErrorActionPreference = 'Stop'
$core = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
function Invoke-Build([string]$directory, [scriptblock]$command) {
  Push-Location -LiteralPath $directory
  try { & $command; if ($LASTEXITCODE -ne 0) { throw "Build failed in $directory ($LASTEXITCODE)" } }
  finally { Pop-Location }
}
Invoke-Build $core { node scripts/sync-vendors.cjs $TestRoot }
Invoke-Build $core { cmake --build (Join-Path $TestRoot 'build\ui-bridge-msvc2026') --config RelWithDebInfo --parallel 4 }
Invoke-Build $core { cmake --build (Join-Path $TestRoot 'build\meridian-movement-native') --config Release --parallel 4 }
Invoke-Build (Join-Path $TestRoot 'repos\aetherius-server') { cmake --build build --config Release --target skymp5-server unit --parallel 4 }
Invoke-Build (Join-Path $TestRoot 'repos\aetherius-server\server') { npm run build-ts }
Invoke-Build (Join-Path $TestRoot 'repos\aetherius-client\client') { npm run build }
Invoke-Build (Join-Path $core '..\referencias\AetheriusGameplayCore\modules\class-system') { npm run build }
Invoke-Build $core { node scripts/package-local-test.cjs $TestRoot }
Write-Output 'Build complete. Deployment and game restart are separate steps.'
