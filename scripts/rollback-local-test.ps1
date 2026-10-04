param([string]$Mo2 = 'C:\modOrganizer', [string]$TestProfile = 'AETHERIUS UI - TESTE LOCAL')
$ErrorActionPreference = 'Stop'
$profile = Join-Path $Mo2 "profiles\$TestProfile"
if (-not (Test-Path -LiteralPath (Join-Path $profile 'aetherius-core-test-owner.txt'))) { throw 'Profile is not owned by this test deployment' }
$modlist = Join-Path $profile 'modlist.txt'
$content = [IO.File]::ReadAllText($modlist).Replace('+Aetherius UI - Core Test', '-Aetherius UI - Core Test')
[IO.File]::WriteAllText($modlist, $content, [Text.UTF8Encoding]::new($false))
'Test mod disabled. Select the original AETHERIUS - GRAFICO - QUALIDADE profile in MO2. Test files and evidence remain available.'
