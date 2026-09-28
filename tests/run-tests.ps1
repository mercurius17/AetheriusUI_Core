param(
  [string]$ServerPackage = "referencias\repositories\aetherius-server\server"
)

$ErrorActionPreference = "Stop"
$coreRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$serverRoot = (Resolve-Path (Join-Path $coreRoot $ServerPackage)).Path
$esbuild = Join-Path $serverRoot "node_modules\.bin\esbuild.cmd"
$outputDir = Join-Path $PSScriptRoot "build"
$outputFile = Join-Path $outputDir "core.test.cjs"

if (-not (Test-Path -LiteralPath $esbuild)) {
  throw "esbuild não encontrado em $esbuild. Instale as dependências do pacote de servidor dentro de AetheriusUI_Core antes de executar os testes."
}
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Push-Location $coreRoot
try {
  & $esbuild (Join-Path $PSScriptRoot "core.test.ts") --bundle --platform=node --format=cjs --target=node18 "--outfile=$outputFile"
  if ($LASTEXITCODE -ne 0) { throw "esbuild falhou ao compilar a suíte do Core." }
  node --test $outputFile
  if ($LASTEXITCODE -ne 0) { throw "A suíte automatizada do Core falhou." }
} finally {
  Pop-Location
}
