# Menu de raças e criação de personagem

Integração de 04/10/2026 de [NaoTemJuju/Aetherius_Criacao_Personagem](https://github.com/NaoTemJuju/Aetherius_Criacao_Personagem), commit `b7b8584a84b113ac4f7b1799d4d944648ba7ff50`.

## Conteúdo integrado

- Snapshot completo dos dez arquivos tracked da origem em `integrations/character-creation/upstream`, com hashes SHA-256 no manifest.json. O repositório original não foi alterado.
- Interface chargen.html/CSS/JS e ilustrações de raças do upstream no frontend do Core.
- chargen.cpp/h incorporados ao **AetheriusUIBridge existente**; uma única DLL, sem substituir o bridge por outra DLL homônima. O main.cpp/CMake originais ficam apenas no snapshot histórico.
- Adapter PERSONAGEM no centro do radial, rota /character, catálogo vanilla de dez raças em consulta e registro no manifesto de empacotamento.
- Bootstrap `character-creation/register-character.cjs` para o router autenticado do servidor.
- Vista nativa adicional carregada quando RaceSexMenu já está aberto. Lê raças, categorias e sliders do SWF vanilla; não depende de RaceMenu. A consulta nativa pode incluir raças que o menu vanilla disponibilizar, enquanto o catálogo do radial é explicitamente limitado à apresentação vanilla.

## Autoridade multiplayer

A origem foi concebida para edição local e chama ChangeRace, callbacks de sliders e ChangeName. Essas operações **não são executadas pelo código nativo integrado**. A política nativa aceita somente snapshot, camera e returnToVanilla; nenhum comando do browser autoriza raça, sexo, aparência, nome ou finalização. A UI bloqueia seus controles de escrita; a validação nativa continua bloqueando solicitações forjadas, independentemente do botão.

O catálogo devolvido pelo servidor é conteúdo de apresentação, não o estado racial de um personagem. O handler aceita somente payload vazio, usa o router autenticado existente e não registra ações de mutação.

A câmera é apresentação local com foco Unpaused: a integração não solicita pausar a simulação multiplayer. Console e caixas nativas suspendem o foco; preload/disconnect limpam a vista. Voltar ao menu nativo apenas restaura a interface vanilla, sem finalizar pelo Core. Esta integração não substitui o controle autoritativo do servidor sobre o fluxo vanilla ou console.

## Registro no servidor

Após instalar o Core e seu transporte, registre no bootstrap existente, antes de publicar a navegação da sessão:

```js
const registerCharacter = require('/caminho/AetheriusUI_Core/character-creation/register-character.cjs');
const unload = uiSystem.registerExternalModule('character', router => registerCharacter(router));
// No shutdown/unload:
unload();
```

`uiSystem` é a instância AetheriusUiSystem do host integrado. Em outro host, registre diretamente no seu UiServerRouter e publique o destino character somente após sucesso. A função retorna cleanup compatível com registerExternalModule; unload.navigation fornece a descrição de disponibilidade.

O build do cliente inclui o adapter, mas ele continua indisponível enquanto o servidor não registrar/publicar o destino. O shell não libera um menu somente porque o cliente instalou o JavaScript. O bootstrap externo não foi modificado automaticamente por este commit.

## Build e pacote

Use o [guia de DLLs](DLL_BUILD_GUIDE.md) e os mesmos CommonLibSSE-NG, toolchain /MD e cabeçalhos Meridian do Core. Não compile/instale em paralelo a DLL homônima da origem.

```powershell
Set-Location 'C:/Code/Aetherius - SkyMP/AetheriusUI_Core'
cmake --build 'C:/Code/Aetherius-MP-Teste/build/ui-bridge-msvc2026' --config RelWithDebInfo --target AetheriusUIBridge KeyboardMovementPolicyTests CharacterPresentationPolicyTests --parallel 4
ctest --test-dir 'C:/Code/Aetherius-MP-Teste/build/ui-bridge-msvc2026' -C RelWithDebInfo --output-on-failure
./tests/run-tests.ps1 -ServerPackage 'C:/Code/Aetherius-MP-Teste/repos/aetherius-server/server'
node --test tests/character-creation-import.test.cjs
node scripts/package-local-test.cjs 'C:/Code/Aetherius-MP-Teste' 'C:/Code/Aetherius - SkyMP/referencias/AetheriusGameplayCore/modules/class-system'
```

CMake copia o frontend completo. O empacotador inclui a vista chargen e os assets modules/character do manifesto. DLL/PDB permanecem nos caminhos documentados no guia; o snapshot histórico não entra em Data.

## Validação e pendências

Build do bridge integrado aprovado em Windows x64/AE 1.6.1170. Core: 18/18 testes, incluindo rejeição de mutações, payload com ator forjado, sessão incorreta, isolamento do catálogo e unload. CTest: 2/2, incluindo whitelist nativa de comandos de apresentação. Importação: 3/3 testes de hashes, ausência de callbacks de mutação e assets. Pacote local com 366 arquivos e hashes conferidos. Compilar não comprova abertura, foco, câmera ou renderização dentro do Skyrim.

O teste `tests/character-creation-browser.cjs` passou com Playwright e Edge headless: controles bloqueados, nome UTF-8, dez ícones, consulta sem comandos de mutação e cleanup. Para reproduzir com Playwright instalado e Edge disponível, execute `node tests/character-creation-browser.cjs`; se o pacote Playwright estiver fora do node_modules, passe seu diretório absoluto como segundo argumento. Essa validação do DOM não substitui o teste nativo em jogo.

Ainda necessário:

1. Registrar o catálogo no servidor de destino e validar a consulta PERSONAGEM em uma sessão real.
2. Implementar fluxo autoritativo de criação/edição: sessão de criação, catálogo de raças permitido pelo servidor, revisão, permissões, validação, rollback e aplicação de resultados aprovados.
3. Persistir raça/nome/aparência e estado da criação no PostgreSQL; ligar atributos/perks raciais ao CombatProfile/ClassSystem.
4. Conectar preview de aparência aprovado pelo host, sem dar ao cliente autoridade sobre raça ou benefícios de gameplay.
5. Testar jogo novo/showracemenu, raças adicionais, câmera, retorno ao vanilla, console/MessageBox, preload/reconexão e ausência de sobreposição com radial/TrueHUD.
6. Auditar as raças efetivamente permitidas pela load order oficial; não usar o catálogo vanilla de apresentação como catálogo autoritativo completo.

A origem não declara arquivo de licença nessa revisão. A atribuição e os arquivos originais foram preservados; não se atribui uma licença nova ao conteúdo importado.
