# Build e implantação local

Esta entrega usa Skyrim 1.6.1170.0, SKSE 2.2.6, Skyrim Platform 2.9.0 e Node 22.14.0. O alvo efetivamente testado é Windows x64/AE. As opções SE da CommonLib não constituem validação SE ou VR.

Antes de configurar os builds em outro checkout, aplique os patches completos das baselines pinadas em [integrations/runtime-changes](../integrations/runtime-changes/README.md). O GameplayCore contém a mesma entrega em `integrations/ui-runtime-changes`; aplique somente uma cópia. Prepare os paths de referência/consumidores usados pelo CMake e pelos scripts. O snapshot preserva fontes/baselines, mas não fornece o cache binário da máquina de desenvolvimento.

O bridge usa CommonLibSSE-NG `alandtse/CommonLibVR@ng`, commit `39f9d07a6ffabea8fb559eee87ab7d27cd463e8a`, C++23 e MSVC 2026 14.51 com CRT `/MD`. O manifesto `native/vcpkg.json` fixa o baseline `ee12231b20c95013c6638d845d04c91559a1d1ff`. Sua configuração local está em `C:/Code/Aetherius-MP-Teste/build/ui-bridge-msvc2026`; as dependências MD estão em `build/ui-bridge/vcpkg_installed`.

Meridian preserva sua própria CommonLib (`alandtse/CommonLibSSE-NG@9b17b42fc9db23aea2b60f92690e778784e612b1`), CEF 152.0.6 e MSVC 2022 14.44 `/MT`. A configuração fica em `build/meridian-movement-native`, com o triplet `scripts/triplets/x64-windows-meridian.cmake`. Nunca misturar seu CEF com o CEF 108 do cache do servidor.

O servidor nativo usa o fork em `repos/aetherius-server/build`, gerador Visual Studio 2022, `BUILD_CLIENT=OFF`, `BUILD_SKYRIM_PLATFORM=OFF`, `BUILD_SCRIPTS=OFF`, `BUILD_UNIT_TESTS=ON`. As dependências foram adquiridas pelo processo existente do fork e pelo cache local `C:/Code/Aetherius - Mods/aetherius-runtime-meridian/build/vcpkg_installed`, triplet `x64-windows-sp`. Essa dependência de cache permanece uma limitação para reprodução em uma máquina limpa. Os diretórios compilados, CMakeCache e logs locais identificam os caminhos efetivos; o script abaixo exige essas configurações preparadas.

```powershell
Set-Location 'C:\Code\Aetherius - SkyMP\AetheriusUI_Core'
./scripts/build-local-test.ps1
./tests/run-tests.ps1 -ServerPackage 'C:\Code\Aetherius-MP-Teste\repos\aetherius-server\server'
node scripts/verify-native-runtime.cjs
node scripts/verify-gameplay-runtime.cjs
```

O build entrega o bridge DLL/PDB, MeridianUIPlugin.dll, MeridianUI.dll, subprocesso e dependências CEF completos, bundle integral do cliente e addon/PDB do servidor. A DLL SkyrimPlatform instalada foi reutilizada: os ajustes deste cliente são TypeScript e não alteram seu ABI nativo. `dumpbin /EXPORTS` confirmou Query/Version/Load do bridge; a carga foi posteriormente confirmada no skse64.log.

`package-local-test.cjs` gera `C:/Code/Aetherius-MP-Teste/packages/Aetherius UI - Core Test`, com hashes SHA-256 e tamanhos em `artifact-manifest.json`. Símbolos ficam fora de Data. Os módulos são declarados em `integrations/modules.local-test.json`; o empacotador gera `modules-config.js`, e o loader carrega seus scripts/CSS locais sem alterações estruturais no shell. O SDK é sincronizado nos três consumidores por `sync-vendors.cjs`, com proveniência e hashes.

Com Skyrim fechado, `scripts/deploy-local-test.ps1` verifica os hashes e implanta somente no mod dedicado `Aetherius UI - Core Test`, ativado somente no perfil `AETHERIUS UI - TESTE LOCAL`. O perfil mantém saves/INIs locais, sem copiar saves originais. O MO2 observa diretórios virtuais de forma diferente do monitor de hot reload do Skyrim Platform: substituir arquivos no mod não comprovou reload nesta sessão. Reiniciar o jogo é o procedimento validado.

O empacotador recria seu diretório Data exato e exclui assets de demonstração. Na implantação, arquivos que constavam do manifesto anterior e foram retirados são removidos apenas dentro do mod dedicado, com verificação do caminho absoluto. Isso impede que a screenshot antiga sobreviva a uma atualização.

Inicie SKSE pelo MO2 com o perfil dedicado. O comando validado foi `ModOrganizer.exe -p "AETHERIUS UI - TESTE LOCAL" run "C:/Games/Steam/steamapps/common/Skyrim Special Edition/skse64_loader.exe"`. Para rollback, feche Skyrim, execute `scripts/rollback-local-test.ps1` e selecione o perfil original. Os arquivos e evidências são preservados para revisão.
