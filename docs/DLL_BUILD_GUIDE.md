# Compilação das DLLs e da integração UI

Referência de 04/10/2026, extraída dos CMakeLists, scripts e CMakeCache dos builds locais. Este guia acompanha tanto AetheriusUI_Core quanto AetheriusGameplayCore. Os comandos usam PowerShell e a árvore local abaixo; ajuste os caminhos ao portar o ambiente.

## 1. O que é compilado

| Componente | Toolchain/configuração usada | Artefato |
|---|---|---|
| Bridge SKSE do Core | VS 18 2026, MSVC 14.51, x64, C++23, CRT /MD, RelWithDebInfo | AetheriusUIBridge.dll e .pdb |
| Plataforma Meridian | VS 17 2022 Build Tools, MSVC 14.44, x64, C++23, CRT /MT, Release | MeridianUIPlugin.dll, MeridianUI.dll, subprocesso e runtime CEF completo |
| Servidor SkyMP | VS 17 2022, x64, triplet x64-windows-sp, Release | scam_native.node e .pdb |
| Cliente multiplayer | TypeScript/webpack | skymp5-client.js |
| GameplayCore ClassSystem | TypeScript; prebuild sincroniza os dados | dist/server/index.js e demais módulos compilados |

`scam_native.node` é um addon nativo carregado pelo Node; não é instalado em Data/SKSE/Plugins. A integração atual reutiliza SkyrimPlatform.dll 2.9.0 instalada: os ajustes do cliente são TypeScript. O ClassSystem também não produz uma DLL própria. O build não habilita mutações de gameplay nem substitui a autoridade do servidor.

Alvo validado: Windows x64, Skyrim AE 1.6.1170.0, SKSE 2.2.6 e Node 22.14.0. SE/VR não foram validados. Build concluído não comprova compatibilidade com o servidor oficial ou persistência PostgreSQL, que continuam pendentes.

## 2. Pré-requisitos e caminhos

Instale Git, Node/npm, CMake compatível com o gerador VS 18 2026 (local: 4.3), Visual Studio 2026 Community com C++ e Visual Studio 2022 Build Tools com C++/v143. O Meridian usa o Windows SDK 10.0.26100.0 e seu compilador de shaders fxc.exe. Mantenha os dois compiladores: trocar apenas o gerador do bridge para 2022 não reproduz o build registrado.

```powershell
$Core = 'C:/Code/Aetherius - SkyMP/AetheriusUI_Core'
$Gameplay = 'C:/Code/Aetherius - SkyMP/referencias/AetheriusGameplayCore'
$TestRoot = 'C:/Code/Aetherius-MP-Teste'
$Meridian = Join-Path $Core 'referencias/repositories/MeridianUI'
$Server = Join-Path $TestRoot 'repos/aetherius-server'
$Client = Join-Path $TestRoot 'repos/aetherius-client'
$Vcpkg = Join-Path $TestRoot 'deps/vcpkg'
$CommonLib = Join-Path $TestRoot 'deps/CommonLibSSE-NG'
$BridgeBuild = Join-Path $TestRoot 'build/ui-bridge-msvc2026'
$MeridianBuild = Join-Path $TestRoot 'build/meridian-movement-native'
$MdDependencies = Join-Path $TestRoot 'build/ui-bridge/vcpkg_installed'
$ServerDependencyRoot = 'C:/Code/Aetherius - Mods/aetherius-runtime-meridian'
$ServerDependencies = Join-Path $ServerDependencyRoot 'build/vcpkg_installed'
$Vs2026 = 'C:/Program Files/Microsoft Visual Studio/18/Community'
$Vs2022 = 'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools'
$Fxc = 'C:/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64/fxc.exe'

cmake --version
node --version
git --version
Test-Path -LiteralPath $Fxc
```

**Limite de reprodução:** os builds existentes foram compilados com caches vcpkg já preparados. Bridge e servidor usam VCPKG_MANIFEST_MODE=OFF, portanto configurar CMake não baixa automaticamente suas dependências. O servidor depende de um cache externo ao workspace. A sequência completa de aquisição desses caches em uma máquina limpa ainda não foi validada. Não copie CMakeCache.txt entre máquinas ou geradores; configure um diretório novo com os caminhos corretos.

O triplet do Meridian está em `$Core/scripts/triplets/x64-windows-meridian.cmake` e contém o caminho local dos Build Tools 2022. Ajuste esse caminho se sua instalação diferir. Bibliotecas /MD do bridge e /MT do Meridian/servidor devem permanecer em caches separados.

## 3. Fontes externas e patches

Os dois repositórios Aetherius guardam os mesmos patches completos. No Core estão em `integrations/runtime-changes`; no GameplayCore, em `integrations/ui-runtime-changes`. Aplique **uma cópia**, apenas em checkouts limpos das baselines abaixo. Não aplique novamente em um checkout local já ajustado, nem combine com os patches históricos `integrations/aetherius-*.patch`.

| Origem | Commit-base |
|---|---|
| https://github.com/AetheriusRP/aetherius-server | a89b2e665bb5821ecd645bc6f3b66213e65f54ef |
| https://github.com/AetheriusRP/aetherius-client | 8d1dd4e97e1f26f80b360af8e0a0cc5ff14e3523 |
| https://github.com/heathbrownkeyworks/MeridianUI | 5707877322c85a1bd1c2e3309487f266d0647ca9 |

Exemplo para um ambiente novo, sem checkouts nesses destinos. Execute cada comando somente se o anterior concluir com código zero:

```powershell
$Snapshot = Join-Path $Core 'integrations/runtime-changes'
git clone https://github.com/AetheriusRP/aetherius-server.git "$Server"
git -C "$Server" checkout --detach a89b2e665bb5821ecd645bc6f3b66213e65f54ef
git -C "$Server" submodule update --init --recursive
git -C "$Server" apply --check "$Snapshot/aetherius-server/changes.patch"
git -C "$Server" apply "$Snapshot/aetherius-server/changes.patch"

git clone https://github.com/AetheriusRP/aetherius-client.git "$Client"
git -C "$Client" checkout --detach 8d1dd4e97e1f26f80b360af8e0a0cc5ff14e3523
git -C "$Client" submodule update --init --recursive
git -C "$Client" apply --check "$Snapshot/aetherius-client/changes.patch"
git -C "$Client" apply "$Snapshot/aetherius-client/changes.patch"

git clone https://github.com/heathbrownkeyworks/MeridianUI.git "$Meridian"
git -C "$Meridian" checkout --detach 5707877322c85a1bd1c2e3309487f266d0647ca9
git -C "$Meridian" submodule update --init --recursive
git -C "$Meridian" apply --check "$Snapshot/MeridianUI/changes.patch"
git -C "$Meridian" apply "$Snapshot/MeridianUI/changes.patch"
```

O CommonLib usado pelo bridge é `alandtse/CommonLibVR`, linha ng, fixado no commit abaixo. O nome local CommonLibSSE-NG é intencional; não o substitua pelo CommonLib do cache do servidor:

```powershell
git clone --branch ng https://github.com/alandtse/CommonLibVR.git "$CommonLib"
git -C "$CommonLib" checkout --detach 39f9d07a6ffabea8fb559eee87ab7d27cd463e8a
git -C "$CommonLib" submodule update --init --recursive
```

O Meridian usa seu próprio port CommonLibSSE-NG em `9b17b42fc9db23aea2b60f92690e778784e612b1` e CEF 152.0.6. Preserve os overlay_ports e vcpkg-configuration.json da baseline com o patch aplicado; seu registry fixa `9e593bb18ea69cc5095e012465dcd675a822ed0d`. O manifesto do bridge fixa `ee12231b20c95013c6638d845d04c91559a1d1ff`, com directxmath, directxtk, fmt, spdlog, nlohmann-json e rapidcsv. Esses manifestos descrevem dependências, mas não eliminam a limitação dos caches indicada acima.

## 4. DLL AetheriusUIBridge

Os pacotes do triplet x64-windows-static-md já precisam estar instalados em $MdDependencies. A configuração registrada foi:

```powershell
$BridgeConfigure = @(
  '-S', "$Core/native", '-B', $BridgeBuild,
  '-G', 'Visual Studio 18 2026', '-A', 'x64',
  "-DCMAKE_GENERATOR_INSTANCE=$Vs2026",
  "-DCMAKE_TOOLCHAIN_FILE=$Vcpkg/scripts/buildsystems/vcpkg.cmake",
  '-DVCPKG_MANIFEST_MODE=OFF',
  "-DVCPKG_INSTALLED_DIR=$MdDependencies",
  '-DVCPKG_TARGET_TRIPLET=x64-windows-static-md',
  "-DCOMMONLIB_SOURCE_DIR=$CommonLib",
  "-DMERIDIAN_SOURCE_DIR=$Meridian",
  "-Dspdlog_DIR=$MdDependencies/x64-windows-static-md/share/spdlog",
  "-Dnlohmann_json_DIR=$MdDependencies/x64-windows-static-md/share/nlohmann_json",
  '-DCOMMONLIB_ENABLE_IPO=OFF',
  '-DAETHERIUS_UI_INCLUDE_FIXTURES=OFF',
  '-DBUILD_TESTING=ON'
)
cmake @BridgeConfigure
if ($LASTEXITCODE -ne 0) { throw 'Falha na configuracao do bridge' }
cmake --build "$BridgeBuild" --config RelWithDebInfo --target AetheriusUIBridge KeyboardMovementPolicyTests --parallel 4
if ($LASTEXITCODE -ne 0) { throw 'Falha no build do bridge' }
ctest --test-dir "$BridgeBuild" -C RelWithDebInfo --output-on-failure
```

Saída: `$BridgeBuild/dist/RelWithDebInfo/Data/SKSE/Plugins/AetheriusUIBridge.dll` e .pdb. AetheriusUIAssets copia o frontend como dependência do target. CommonLib é compilado junto; não há CommonLibSSE.dll a instalar.

## 5. DLLs Meridian e CEF

```powershell
$MeridianConfigure = @(
  '-S', $Meridian, '-B', $MeridianBuild,
  '-G', 'Visual Studio 17 2022', '-A', 'x64',
  "-DCMAKE_GENERATOR_INSTANCE=$Vs2022",
  "-DCMAKE_TOOLCHAIN_FILE=$Vcpkg/scripts/buildsystems/vcpkg.cmake",
  '-DVCPKG_MANIFEST_MODE=ON', '-DVCPKG_MANIFEST_INSTALL=ON',
  "-DVCPKG_INSTALLED_DIR=$MeridianBuild/vcpkg_installed",
  "-DVCPKG_OVERLAY_TRIPLETS=$Core/scripts/triplets",
  '-DVCPKG_TARGET_TRIPLET=x64-windows-meridian',
  "-DMERIDIAN_FXC_EXECUTABLE=$Fxc",
  '-DBUILD_AS_SHARED=ON', '-DBUILD_TESTING=ON',
  '-DENABLE_LTO=OFF', '-DMERIDIAN_ENABLE_SIGNING=OFF',
  '-DMERIDIAN_BUILD_FIXTURE=OFF', '-DMERIDIAN_BUILD_NIF_TEST=OFF',
  '-DMERIDIAN_BUILD_INPUT_TEST=OFF', '-DMERIDIAN_BUILD_CEF_CPU_SMOKE=OFF'
)
cmake @MeridianConfigure
if ($LASTEXITCODE -ne 0) { throw 'Falha na configuracao do Meridian' }
cmake --build "$MeridianBuild" --config Release --parallel 4
if ($LASTEXITCODE -ne 0) { throw 'Falha no build do Meridian' }
ctest --test-dir "$MeridianBuild" -C Release --output-on-failure -R '^(NifPreviewGpuTests|NifPreviewGpuUnsupportedSharingTests|NifSceneCompositionTests|NifCameraMathTests|NifPreviewRendererArchitectureTests)$'
```

O build completo inclui os targets MeridianUI, MeridianUIPlugin e MeridianCEFSubprocess, staging de recursos e verificação do release. Use o build completo para produzir o pacote; gerar só uma DLL não garante os recursos CEF/shaders/licenças.

Dentro de `$MeridianBuild/dist/Release/Data`:

- SKSE/Plugins/MeridianUIPlugin.dll: bootstrap SKSE.
- MeridianUI/MeridianUI.dll: plataforma de UI e renderer.
- MeridianUI/MeridianCEFSubProcess.exe: processo CEF.
- MeridianUI/libcef.dll, demais DLLs/recursos/paks/locales: preserve toda a árvore produzida.

PDBs são coletados em `$MeridianBuild/symbols/Release`. MERIDIAN_BUILD_NIF_TEST=OFF desativa apenas o consumidor de teste separado; o preview NIF de produção continua no MeridianUI.dll. Para a regressão opcional na GPU física: `& "$MeridianBuild/Release/NifPreviewGpuTests.exe" --unsupported-sharing --hardware`. Fixtures sintéticas não substituem a validação dos modelos dentro do jogo.

## 6. Addon nativo do servidor

O fork exige a pasta de build exatamente em `$Server/build` e o gerador VS 17 2022. Este comando reproduz as opções locais usando o cache externo já disponível:

```powershell
$ServerConfigure = @(
  '-S', $Server, '-B', "$Server/build",
  '-G', 'Visual Studio 17 2022', '-A', 'x64',
  "-DCMAKE_GENERATOR_INSTANCE=$Vs2022",
  "-DCMAKE_TOOLCHAIN_FILE=$ServerDependencyRoot/vcpkg/scripts/buildsystems/vcpkg.cmake",
  '-DVCPKG_MANIFEST_MODE=OFF',
  "-DVCPKG_INSTALLED_DIR=$ServerDependencies",
  '-DVCPKG_TARGET_TRIPLET=x64-windows-sp',
  '-DBUILD_CLIENT=OFF', '-DBUILD_SKYRIM_PLATFORM=OFF',
  '-DBUILD_SCRIPTS=OFF', '-DBUILD_UNIT_TESTS=ON',
  '-DBUILD_FRONT=OFF', '-DBUILD_GAMEMODE=OFF', '-DBUILD_NODEJS=OFF'
)
cmake @ServerConfigure
if ($LASTEXITCODE -ne 0) { throw 'Falha na configuracao do servidor' }
cmake --build "$Server/build" --config Release --target skymp5-server unit --parallel 4
if ($LASTEXITCODE -ne 0) { throw 'Falha no build do servidor' }
```

Saídas: `$Server/build/dist/server/scam_native.node` e scam_native.pdb. BUILD_NODEJS=OFF reutiliza a dependência Node do fork; compatibilidade de addon/runtime deve ser verificada ao trocar a versão do Node. Nunca misture o CEF 108 desse cache com o runtime CEF 152 do Meridian.

A load order não recompila o addon por plugin ESP/ESM/ESL: ela é fornecida ao runtime por staging dos vencedores, masters e scripts. A preparação local requer exportações atuais do houseCARL, detalhadas no documento LOCAL_TEST_SERVER do Core. Não presuma que compilar o addon valida todas as quests/Papyrus da load order.

## 7. SDK, TypeScript e pacote integrado

Antes dos builds TypeScript, sincronize shared/sdk do Core nos consumidores. Para uma instalação nova, respeite os locks: servidor e cliente possuem yarn.lock (Yarn Classic com --frozen-lockfile), ClassSystem possui package-lock.json (npm ci). Instale nas pastas server, client e modules/class-system, respectivamente; não use npm ci na raiz do fork sem package.json. Não regenere locks só para compilar. O ambiente local já tinha node_modules preparado.

```powershell
Set-Location -LiteralPath $Core
node scripts/sync-vendors.cjs "$TestRoot" "$Gameplay/modules/class-system"
if ($LASTEXITCODE -ne 0) { throw 'Falha na sincronizacao do SDK' }

Push-Location -LiteralPath "$Server/server"
try {
  npm run build-ts
  if ($LASTEXITCODE -ne 0) { throw 'Falha no TypeScript do servidor' }
} finally { Pop-Location }
Push-Location -LiteralPath "$Client/client"
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Falha no bundle do cliente' }
} finally { Pop-Location }
Push-Location -LiteralPath "$Gameplay/modules/class-system"
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Falha no ClassSystem' }
} finally { Pop-Location }

node scripts/package-local-test.cjs "$TestRoot" "$Gameplay/modules/class-system"
if ($LASTEXITCODE -ne 0) { throw 'Falha no pacote integrado' }
```

Outputs TypeScript: servidor em `$Server/build/dist/server/dist_back`, cliente em `$Client/build/dist/client/Data/Platform/Plugins/skymp5-client.js` e ClassSystem em `$Gameplay/modules/class-system/dist`.

Com caches, dependências e layout local preparados, o atalho no Core é `./scripts/build-local-test.ps1 -TestRoot $TestRoot`. Ele compila bridge, Meridian, addon, TypeScript e gera o pacote; usa o GameplayCore no caminho relativo `../referencias/AetheriusGameplayCore`. Para outro layout, use os comandos explícitos acima.

Pacote do jogo: `$TestRoot/packages/Aetherius UI - Core Test`. O empacotador copia toda a árvore Data do Meridian, DLL do bridge, cliente e módulos UI; exclui a screenshot de demonstração. artifact-manifest.json registra tamanho/SHA-256; PDBs ficam em symbols, fora de Data. O addon do servidor permanece na distribuição do servidor, não nesse mod.

## 8. Instalação e verificação local

Com Skyrim fechado e o perfil de teste preparado, execute do Core:

```powershell
./scripts/deploy-local-test.ps1 -TestRoot "$TestRoot" -Mo2 'C:/modOrganizer'
```

O script confere hashes e instala no mod dedicado Aetherius UI - Core Test, perfil AETHERIUS UI - TESTE LOCAL. Preserve Skyrim Platform, Address Library e demais dependências do perfil. Inicie SKSE pelo MO2 e reinicie o jogo após atualizar DLLs/bundle; o hot reload através do VFS não foi confiável na sessão validada.

Confira skse64.log, AetheriusUIBridge.log e MeridianUI.log em `Documents/My Games/Skyrim Special Edition/SKSE`. Em um Developer PowerShell, `dumpbin /EXPORTS <caminho-do-bridge.dll>` permite conferir os símbolos SKSE de Query/Version/Load. CTest e arquivo DLL existente não comprovam a carga no jogo; verifique o log SKSE e a navegação/preview em sessão.

O host local é iniciado pelo script start-local-server.ps1 após preparar seu runtime; ele aceita somente localhost/offline. Use stop-local-server.ps1 para encerrar o processo registrado. Consulte LOCAL_TEST_SERVER e BUILD_AND_DEPLOY no Core para o staging VFS e rollback.

## 9. Diagnóstico e limites conhecidos

| Sintoma | Conferência |
|---|---|
| CMake não encontra CommonLib/spdlog/json | Confirmar fonte pinada, triplet e diretório installed; manifesto OFF não instala pacotes. |
| LNK2038 RuntimeLibrary ou STL incompatível | Recompilar dependências com CRT e toolset do componente; não compartilhar /MD e /MT. |
| Gerador diferente do cache | Usar um diretório de build novo; não alternar VS 2022/2026 no mesmo cache. |
| Shader fxc ausente | Instalar SDK e ajustar MERIDIAN_FXC_EXECUTABLE. |
| UI vazia/subprocesso falha | Usar árvore CEF completa, sem misturar versões; conferir MeridianUI.log. |
| Plugin SKSE não carrega | Conferir runtime AE, SKSE, Address Library, arquitetura x64, dependências e log SKSE. |
| Addon Node não carrega | Conferir runtime/ABI e build nativo correspondente; não renomear .node para .dll. |
| Módulo externo não registrado | Empacotar Class/Party/Inventory/Spells e modules-config.js junto com o cliente atualizado. |

Validação registrada antes deste guia: bridge 1/1 CTest; renderer 5/5 e regressões de GPU; Core 17/17; UI 23/23; cliente 28/28; ClassSystem build aprovado com 49/55 testes e seis falhas preexistentes documentadas. As últimas correções de transparência do preview e TAB fechar somente o mapa ainda aguardam confirmação visual.

Permanecem pendentes a reprodução em máquina limpa, adapters autoritativos de gameplay, migração da persistência UI para PostgreSQL, adaptação ao servidor oficial e validação multiplayer/produção. Ter pg no fork não comprova que os módulos UI já usam PostgreSQL. O preview 3D é apresentação local; não depende de conceder autoridade ao cliente.
