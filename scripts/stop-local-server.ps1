param([string]$TestRoot = 'C:\Code\Aetherius-MP-Teste')
$ErrorActionPreference = 'Stop'
$runtime = [IO.Path]::GetFullPath((Join-Path $TestRoot 'runtime'))
$record = Get-Content -LiteralPath (Join-Path $runtime 'local-server-process.json') -Raw | ConvertFrom-Json
$targetProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($record.pid)"
if ($targetProcess) {
  if ($targetProcess.ExecutablePath -ne $record.executable -or $targetProcess.CommandLine -notlike ('*' + $record.entry + '*')) { throw 'PID was reused or is not this local test server' }
  node -e 'process.kill(Number(process.argv[1]), "SIGTERM")' $record.pid
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop the local test server' }
}
