param([string]$TestRoot = 'C:\Code\Aetherius-MP-Teste')
$ErrorActionPreference = 'Stop'
$runtime = [IO.Path]::GetFullPath((Join-Path $TestRoot 'runtime'))
$settings = Get-Content -LiteralPath (Join-Path $runtime 'server-settings.json') -Raw | ConvertFrom-Json
if ($settings.listenHost -ne '127.0.0.1' -or $settings.uiListenHost -ne '127.0.0.1' -or -not $settings.offlineMode) { throw 'Only isolated localhost runtime may be started by this script' }
$entry = Join-Path $runtime 'dist_back\skymp5-server.js'
if (-not (Test-Path -LiteralPath $entry)) { throw 'Server bundle missing' }
$node = (Get-Command node).Source
$process = Start-Process -FilePath $node -ArgumentList @('"' + $entry + '"') -WorkingDirectory $runtime -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'server-stdout.log') -RedirectStandardError (Join-Path $runtime 'server-stderr.log')
@{ pid = $process.Id; executable = $node; entry = $entry; started = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'local-server-process.json')
Write-Output "Local test server PID $($process.Id); UDP 7777, HTTP 3000."
