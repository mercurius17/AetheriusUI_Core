# MAPA nativo no radial do TAB — 0.3.1

O módulo `map`, rota `/map`, slot 6 **MAPA**, chama a visualização do mapa do Skyrim pelo cliente. Não substitui o mapa por uma tela CEF: o CEF prepara a chamada e libera seu foco para o jogo. O controle do engine é `Quick Map`, confirmado nas [declarações do SKSE](https://github.com/ianpatt/skse64/blob/master/skse64/GameInput.h). As assinaturas `Input.GetMappedKey`, `Input.TapKey` e `UI.IsMenuOpen` foram conferidas no corpus local `papyrus-reference` e nas tipagens do Skyrim Platform 2.8.0 do checkout; a classe exportada no TypeScript é `Ui`.

## Fluxo

1. TAB abre o radial existente. Clicar em MAPA monta o módulo local.
2. `map/prepareNative` passa pelo bridge existente `AetheriusUI.FromView`. O cliente autentica a sessão, confere o estado do jogo e a associação de teclado de `Quick Map`; retorna um ticket curto.
3. `map/openNative` confirma o ticket. O CEF pede `aetheriusUiSetFocus('false')`, que já existe no bridge do Core.
4. O cliente aguarda `AetheriusUI.FocusState=false` e o fechamento real de `MeridianUI_FocusMenu`, cuja fila de fechamento é independente. Então chama `Input.tapKey(Input.getMappedKey('Quick Map', 0))` uma única vez, no update do cliente.
5. O jogo exibe seu `MapMenu`. Só o evento `menuOpen` ou a consulta positiva de `Ui.isMenuOpen('MapMenu')` confirma que a tela abriu. Não se mostra mensagem de “operação concluída”.

O controle respeita a associação de teclado do jogador. Não fixa a tecla M; uma associação ausente ou em conflito com a tecla do menu TAB é recusada. Associação exclusiva em mouse/gamepad precisa de um futuro acionador semântico nativo; este adaptador verifica e usa a associação de **teclado**. Console, carregamento, diálogo, criação de personagem e outros menus incompatíveis bloqueiam a abertura. Repetir um envelope não simula outra tecla; isso evita fechar o mapa por um segundo toggle.

Sair do módulo antes de confirmar cancela o ticket. Disconnect, substituição de sessão, retomada do foco do CEF e timeout eliminam comandos pendentes. Se o jogo não abrir o mapa, não é registrado sucesso nem há retentativa automática de tecla. Alterações no controle durante a transição são reavaliadas antes de acioná-lo. Não altera fast travel, teleporta ou muda dados do personagem.

## Arquivos e instalação

- `ui/map-module.js`: registro do slot MAPA e preparação/confirmação/liberação do CEF.
- `integrations/client/nativeMapControl.ts`: execução local usando a API existente do Skyrim Platform/SKSE.
- `integrations/overlays/aetherius-client/client/src/services/services/aetheriusUiService.ts`: serviço original com o controlador vinculado ao transporte e eventos de foco/sessão. `nativeMapControl.ts` acompanha o overlay na mesma pasta.
- `integrations/register-native-map.cjs`: registro de metadados de navegação no Core. Expõe somente `map/snapshot`; preparar/abrir/cancelar são interceptados localmente no cliente e não chegam ao servidor.

O pacote Meridian carrega o módulo automaticamente. O bootstrap `register-inventory.cjs` registra também MAPA. Quando MAPA for instalado isoladamente, chamar `registerNativeMap(coreUiSystem)` uma vez; não chamar novamente se o bootstrap do inventário já tiver feito esse registro. O registro isolado não depende da persistência ou fence de mutações do inventário.

O pacote `dist/client-package/Data/Platform/Plugins/skymp5-client.js` traz o **cliente completo compilado com MAPA integrado**, pronto para ser instalado pelo fluxo de mods/cliente do projeto. A compilação foi feita com webpack, target Node, ts-loader e os mesmos externals/entry do cliente de referência, em staging dentro de `ui-inventory`; não instala arquivos no jogo automaticamente. O pacote inclui também os dois arquivos TypeScript de alteração e este documento. Alternativamente, aplicar os dois arquivos em `aetherius-client/client/src/services/services/` e recompilar no checkout que produz o cliente distribuído. O serviço `AetheriusUiService` e o bridge Meridian do Core já devem estar carregados. Colocar somente `map-module.js` no CEF não instala a alteração do cliente.

Todas as alterações e staging ficaram em `ui-inventory`; o checkout de referência não foi modificado. Nenhuma nova DLL/C++ foi gerada: a chamada usa funções já expostas pelo cliente. O módulo foi compilado e testado em staging, **não instalado nem verificado em uma sessão real de Skyrim**.

## Verificação

`npm test` executa os testes do Core, gera os overlays, checa os tipos do controlador contra a dependência real do Skyrim Platform e compila o serviço de cliente com a alteração, além do entry completo do cliente. O build webpack usa `transpileOnly`; o controlador novo passa por checagem de tipos separada. A compilação não equivale a uma checagem de tipos completa do cliente legado. Os testes exercitam o serviço real com mod events/envelopes, controle remapeado, espera por foco/menu Meridian, cancelamento, replay, timeout, ações inválidas, ausência de capability e transporte normal de inventário.

A prévia `http://127.0.0.1:4177/?menu=map` mostra o slot e informa que o mapa nativo precisa de Skyrim; não simula um mapa funcional nem envia uma tecla ao Windows. Verificação em jogo pendente: abrir TAB → MAPA, navegar/fechar o MapMenu, remapear a tecla, repetir cliques e testar com carregamento/console/menus incompatíveis. O mapa deve receber o input após o fechamento do CEF, e TAB deve poder abrir novamente o radial depois que o mapa fechar.
