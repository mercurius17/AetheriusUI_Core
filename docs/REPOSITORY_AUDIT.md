# Auditoria dos repositórios — Aetherius UI Core

Data da auditoria: 28/09/2026  
Escopo de escrita: `AetheriusUI_Core`  
Referências clonadas em `referencias/repositories/` com `--depth 1`, branch `main`.

## Checkouts usados

Os seis checkouts estavam limpos antes das alterações desta tarefa. O diretório do projeto recebido não é um checkout Git; por isso não há branch/commit do diretório `AetheriusUI_Core` para registrar.

| Repositório | Branch/ref | Commit observado | Observação |
|---|---|---|---|
| `AetheriusRP/aetherius-launcher` | `main` | `93383b1db7ffe48c49ae6b7d4109d4471923208e` | React 19, Vite 7, Tauri 2; launcher em português. |
| `AetheriusRP/aetherius-client` | `main` | `5a7368719f37e89762df4ad010ac691deeb51d94` | Cliente Skyrim Platform, pacote `skymp5-client` 1.0.0. |
| `AetheriusRP/aetherius-server` | `main` | `c97fb3fe8b1e382d1e87aa09ca0ccf4c3b8d4c29` | Servidor SkyMP TypeScript/C++; contém o runtime Skyrim Platform. |
| `heathbrownkeyworks/MeridianUI` | `main` | `5707877322c85a1bd1c2e3309487f266d0647ca9` | README identifica a fonte como Meridian UI 1.5.0. |
| `skyrim-multiplayer/skymp` | `main` | `f926944b18e3aed4bc3864ce668626c05ec2545f` | Referência upstream; não alterada. |
| `Alduinak-RP/alduinak` | `main` | `a9af0b6ab7718b8f8e281a65f718a7e668ffa10c` | Referência de padrões; não alterada nem copiada. |

## Base real do cliente e do servidor

- O cliente usa `@skyrim-platform/skyrim-platform` 2.8.0, TypeScript 4.5.4 e Webpack 5.94.0. O build do cliente é `yarn build`; `client/CMakeLists.txt` chama `yarn install` e grava o plugin compilado no diretório `build/dist/client/Data/Platform/Plugins`.
- O cliente já tem `BrowserService`, `BridgeService` e `NetworkingService`. A UI legada usa `sp.browser`; a ponte envia eventos `cef::ui:event` como `MsgType.CustomPacket` pelo evento `sendMessage`, com confiabilidade `reliable`.
- A recepção de pacotes do cliente emite `customPacketMessage`. O canal de texto JSON é compartilhado por `contentJsonDump`.
- O servidor define `System.customPacket(userId, type, content, ctx)`. O `userId` vem do evento de conexão do transporte, e `ScampServer` já fornece `isConnected`, `getUserGuid`, `getUserActor` e `sendCustomPacket`. A implementação atual parseia JSON e despacha `customPacket` para cada sistema.
- O build TypeScript do servidor é `yarn build-ts` (`tsc --noEmit` e `esbuild`). O pacote servidor lista `pg` e Prometheus; o servidor também chama `attachSaveStorage()`. Não foi encontrada uma política documentada de rotação de logs nem um subsistema de auditoria da UI.
- `server/ts/ui.ts` serve arquivos de `data` por HTTP e oferece proxy de desenvolvimento. Isso não comprova compatibilidade com `mod://`, nem empacotamento de assets do Meridian.

## Meridian, Skyrim e input

- As bases Aetherius não fixam Meridian, SKSE, Address Library nem uma versão de Skyrim. O perfil de referência enumera mods, mas não identifica uma versão instalada que possa ser tratada como runtime de produção.
- O Meridian atual publica `IUIPlatformAPI` 1.0, `Meridian.View/1` e `Meridian.Input/1`. Os headers e guias estão no checkout clonado. A documentação recomenda conteúdo local `mod://<owner>/<path>` e callbacks do CEF que encaminhem operações de jogo para a thread principal.
- O `Meridian.Input/1` encontrado configura navegação de controle. O contrato de View não expõe uma política de teclado que passe WASD ao jogo enquanto consome outras teclas. O foco atual do Skyrim Platform, por sua vez, é amplo; `BrowserService` contém atalhos por scan code e não implementa o TAB do shell.
- O cliente não declara um bridge SKSE próprio do Aetherius nem um mecanismo de instalação do Meridian. A distribuição dessa dependência e do plugin consumidor precisa ser validada no pipeline do launcher antes de release.

## Branding, dados e limitações do preflight

- O launcher já usa `#4FC787`, superfícies escuras e detalhes lineares. A fonte `futura-book-bt.ttf` foi fornecida nesta tarefa em `referencias/` e copiada sem alteração para os assets do Core.
- A identidade de jogador não vem do browser: o handler de servidor recebe o `userId` autenticado. O novo router deve derivar ator/sessão desse contexto.
- Nenhuma chamada de gameplay do cliente, mutação persistente ou integração de inventário foi implementada nesta etapa. Os slots de domínio são descritores externos.
- Não foram executados Skyrim, SKSE, Mod Organizer 2 ou o launcher. Compatibilidade de foco, TAB, WASD/corrida, mouse-look, empacotamento, renderização D3D11 e desempenho continuam validações in-game pendentes.

## Comandos identificados

| Área | Comando disponível no repositório | Execução nesta tarefa |
|---|---|---|
| Cliente | `yarn build` | Executado com sucesso após integração; Webpack 5.94.0. |
| Servidor | `yarn build-ts` | Script executado via `npm run build-ts`; `tsc` e `esbuild` passaram. |
| Launcher | `npm run build` | Não alterado; sem motivo para rebuild. |
| Meridian nativo | `cmake -S native -B native/build` | Tentado; configuração bloqueada antes das dependências por ausência de compilador C++. |
| Core | `tests/run-tests.ps1` | Executado: 14/14 testes aprovados. |

## Alterações e validações desta implementação

Os clones abaixo começaram limpos. Nenhuma branch foi criada/trocada, commitada ou enviada ao remoto; as alterações permanecem como working-tree local dentro deste `AetheriusUI_Core`.

| Checkout | Alterações locais |
|---|---|
| `aetherius-client` (`main`, `5a7368719f37e89762df4ad010ac691deeb51d94`) | `client/src/index.ts`, `client/src/services/events/events.ts`, `client/src/services/services/browserService.ts` e novo `client/src/services/services/aetheriusUiService.ts`. O novo serviço leva envelopes pelo `CustomPacket` reliable já existente, recebe sessão do servidor, valida limites/schema/sessão e troca eventos locais com o plugin. `BrowserService` oculta o CEF legado enquanto a View Meridian está focada. |
| `aetherius-server` (`main`, `c97fb3fe8b1e382d1e87aa09ca0ccf4c3b8d4c29`) | `server/ts/index.ts` e novo `server/ts/systems/aetheriusUiSystem.ts`. O dispatcher externo limita/parsa pacotes; o sistema emite sessão depois de `spawnAllowed`, oferece `core.snapshot` e habilita `core.echo` somente com `AETHERIUS_UI_DEMO=1`, com rate limit e identidade derivada do contexto autenticado. `server/yarn.lock` foi restaurado ao original. |
| `MeridianUI`, `skymp`, `aetherius-launcher`, `alduinak` | Sem alterações. |
| Raiz `AetheriusUI_Core` | Não é checkout Git. Contém `shared/`, `sdk/`, `frontend/`, `native/`, `tests/`, documentação e clones rasos em `referencias/repositories/`. |

### Resultado das validações

- Cliente: `yarn install --frozen-lockfile` e `yarn build` passaram; build gera `skymp5-client.js` dentro do clone local.
- Servidor: dependências do `package-lock.json` instaladas via `npm ci --cache <AetheriusUI_Core>/tmp/npm-cache`; `npm run build-ts` passou (`tsc --noEmit` e bundle esbuild).
- Core: `tests/run-tests.ps1` passou com 14 testes, cobrindo catálogo, geometria, protocolo, revisions/dedupe, registry lifecycle, router, SDK frontend/server e bridge local. `node --check` passou para shell, HUD e ambas as fixtures.
- TypeScript estrito: `tsc --noEmit --strict` passou sobre `shared/`, SDKs e suíte de testes, com libs ES2022/DOM.
- Fonte: SHA-256 do arquivo fornecido e da cópia em `frontend/Data/MeridianUI/aetheriusui/fonts/` é `B4B2D1B59DAF1BB628FA987F9AFCC3D16764AA7D6B858F4E683C6BE2867D9727`.
- Nativo: `cmake -S native -B native/build` selecionou Visual Studio 18 2026, sem toolchain MSVC disponível. A tentativa `cmake -G "MinGW Makefiles" -S native -B native/build-mingw` detectou GCC 8.1, mas não encontrou `CommonLibSSEConfig.cmake`. O bridge Meridian não foi compilado nem carregado.
- Fixtures e Skyrim: o teste estático confirma contrato/slots, mas a navegação, eco real, foco, HUD, renderização e desempenho in-game continuam **NÃO EXECUTADOS**. Ver `TEST_MATRIX.md` e ADR 0002.
