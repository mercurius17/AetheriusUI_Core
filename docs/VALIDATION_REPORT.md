# Validação local — 04/10/2026

Skyrim AE 1.6.1170, perfil MO2 `AETHERIUS UI - TESTE LOCAL`, servidor localhost. Load order: 424 plugins (119 regulares, 305 light), 60 BSAs consultados e 16.210 scripts vencedores preparados. Scripts permanecem sem execução automática no host: sua compatibilidade Papyrus ainda não foi validada.

## Comprovado no jogo

SKSE carregou AetheriusUIBridge.dll e MeridianUIPlugin.dll. MainView/HUDView ficaram prontas; a sessão foi entregue à MainView em 04/10/2026 14:55:10. O usuário confirmou ícones do TAB, WASD com UI aberta, CLASSE e GRUPO. Não considerar isso validação de mutações de gameplay.

O cliente agora transfere CustomPacket do evento `tick` para uma fila limitada drenada em `update`, onde chamadas Papyrus são permitidas. O bridge mantém dados enfileirados até a MainView ficar pronta.

## Correções posteriores

- Vida, magia e vigor removidos do HTML/renderer do Core; servidor deixa de publicar essas barras. TrueHUD conserva essa apresentação. Necessidades só recebem dados quando existir provider.
- INVENTÁRIO/FEITIÇOS instalados pelo manifesto e registrados no servidor. Consultam Inventory e habilidades conhecidas do ator autenticado, incluindo raça/base e aprendizado. `knownSpells` é propriedade nativa sem setter.
- Equipamento, consumo, destruição, aprendizado e favoritos permanecem fechados nesse provider. Adapter nativo transacional e fence dos escritores legados continuam pendentes. Carga máxima, efeitos ativos e custos dinâmicos sem provider aparecem sem valor disponível.
- SVGs do radial embutidos no HTML; nós reutilizados, sem recarregar ícones a cada abertura/atualização.
- Movimento completo é padrão explícito, inclusive se Windows informa movimento reduzido. Override `window.AetheriusUIMotion='reduced'` reduz efeitos. Radial: 780 ms; workspace elástico: 940 ms.
- Troca inventário/feitiços pelo SDK público com validação de rota/cleanup. Backspace preserva edição de busca; modais fecham de forma idempotente.

## Verificações

Addon nativo e bundle TypeScript do servidor recompilados. Teste no host nativo com 424 plugins passou: item real/quantidade/categoria/detalhes, rejeição de identidade/itens alheios e de mutações, leitura de habilidades conhecidas, ausência de barras e recusa do setter `knownSpells`. Usa bot nativo e armazenamento/porta separados; não substitui o jogo.

Core: 17/17. UI/controles/navegação: 13/13, incluindo browsing sem mutações quando o servidor declara modo de consulta. Cliente: 27/27 na correção anterior. Meridian: foco/movimento e SVG passaram. Allowlist Papyrus: 1 caso, 2 assertivas. GameplayCore: 49/55, mesmas seis falhas da baseline em quatro suítes; suíte não inteiramente aprovada.

Prévia no navegador: inventário/feitiços abriram, troca funcionou, busca com Backspace preservou workspace. CSS confirmou radial 780 ms e foi observada interpolação do clip-path. Usa dados sintéticos e não é instalada no jogo. Evidência em `C:/Code/Aetherius-MP-Teste/evidence/spells-browser-preview.png`.

## Confirmação visual pendente no próximo jogo

O usuário confirmou as animações em CEF na rodada seguinte. Reportou screenshot demonstrativa no TAB, página intermediária de MAPA e inventário indisponível. Corrigidos nesta rodada: screenshot movida para fixtures fora de Data e excluída do pacote; CSS sem fundo de demonstração; hook `activate` abre MAPA sem workspace; bridge republica foco real antes de enviar requests; refresh repetido de foco não cancela mapa comprometido.

O inventário com ouro/armaduras do jogador local foi reproduzido em um ator de teste isolado. Antes da correção retornava error; depois retornou snapshot e itemDetails válidos, preservando o inventário do servidor. Metadados opcionais undefined são omitidos do DTO antes da validação do protocolo. Evidências: `inventory-regression-before.log` e `inventory-regression-after.log`. Cliente: 28/28. UI, navegação e mapa: 24/24. Bridge DLL/PDB, bundle completo do cliente e TypeScript do servidor recompilados.

Confirmação no jogo ainda necessária para fundo transparente, abertura do MapMenu nativo e inventário renderizado. A regressão do inventário usa host nativo com load order completa; os testes de foco/mapa usam APIs simuladas e não substituem a confirmação visual no jogo.

Pacote r2 implantado com hashes Data conferidos. HouseCARL confirmou o mod dedicado como vencedor para bridge DLL, cliente e adapter MAPA; o caminho antigo da screenshot está ausente no VFS. Servidor local atualizado iniciado antes do SKSE. Arquivo `artifacts/AetheriusUI-Core-local-20261004-r2.zip`, SHA-256 `94b74ec6f330c898c8c71fcc7296c15a78e7993f070302ec606dc28eab6eee33`.

Artefatos/hashes/logs: `C:/Code/Aetherius-MP-Teste`. Build: BUILD_AND_DEPLOY.md. Limitações: INTEGRATION_GAMEPLAY_CORE.md. Rollback conserva perfil original e evidências.

## Rodada posterior: mapa nativo e preview 3D

O usuário confirmou inventário de itens/feitiços respeitando os limites de integração, mas MAPA ainda dizia para abri-lo pelo TAB. Diagnóstico local registrou focus released em todas as solicitações: a dependência desse sinal client-side foi retirada. O hook do radial agora chama uma ação visual específica do bridge; a DLL libera Meridian e envia kShow para MapMenu, mantendo guards de estado/controles/outros menus. Commit precede o fechamento do radial; confirmação depende de MenuOpenCloseEvent. Cancelamento usa geração atômica entre as filas game/UI.

O preview anterior era apenas um contrato sem implementação e o provider retornava previewToken null. Agora itemDetails emite token do item pertencente ao ator autenticado; o bridge mantém allowlist limitada dos tokens recebidos, resolve TESModel/worldModels na load order local e usa Meridian RenderLayer/1 + NifView/1. Superfície segue o retângulo da UI, câmera suporta rotação/zoom limitados, fechamento limpa o modelo, e readiness vem do renderer. É apresentação local, independente das mutações autoritativas ainda indisponíveis.

Bridge DLL/PDB e servidor TypeScript recompilados. Interface/ciclo de vida: 22/22, incluindo commit/focus release, abort, status Ready e troca de seleção. Host nativo com 424 plugins confirmou tokens de armadura/espada e rejeição de itens alheios/mutações. HouseCARL leu os registros vencedores de ArmorIronCuirass/IronSword. Esses testes não confirmam o MapMenu nem o desenho 3D em jogo: continuam pendentes no próximo teste visual.

Pacote r3 instalado com todos os hashes Data verificados. HouseCARL confirmou bridge, native-presentation.js e adapter MAPA como vencedores no perfil de testes. Servidor atualizado pronto antes de relançar SKSE; skse64.log confirmou a carga de AetheriusUIBridge.dll e MeridianUIPlugin.dll. ZIP `artifacts/AetheriusUI-Core-local-20261004-r3.zip`, SHA-256 `1d14daf732dc759446a2a651b0dfefa48d9d2f5e11cb1a4fb323a02afbd65738`.

## Rodada r4: transporte gráfico do preview

O usuário confirmou animações e abertura do mapa nativo no jogo. Reportou preview de Iron Armor com quadriculado e “Modelo não suportado”. Logs preservados em `evidence/run7-before-update`: modelo `Armor\\Iron\\Male\\CuirassLightGND.nif` localizado, extração e composição com status Success/None, mas criação da textura compartilhada falhou com HRESULT `0x80070057`. O mesmo ocorreu com `Clutter\\Coin01.nif`. Dispositivo nativo D3D11, AMD Radeon RX 9070 XT; o probe de shared keyed textures já falhava na inicialização. O browser aplicava fallback SyncCopy, mas o renderer NIF continuava exigindo esse transporte.

RenderHost e renderer NIF agora selecionam um contexto deferred isolado do dispositivo do jogo quando a capacidade de compartilhamento está indisponível. A submissão ocorre no render thread e restaura o estado gráfico do jogo; browsers continuam no transporte próprio. Superfícies NIF em Loading/Failed/Unsupported ficam transparentes, sem o quadriculado diagnóstico. Falha gráfica é distinguida de geometria não suportada no bridge/UI; o mesmo token com falha não recarrega em cada refresh do inventário. Selecionar outro item ou reabrir o inventário permite nova carga.

MeridianUI.dll e AetheriusUIBridge.dll/PDB recompilados. CTest gráfico: 5/5 (renderer de produção, fallback sem compartilhamento, composição, câmera e arquitetura); bridge: 1/1; interface/mapa/navegação: 23/23. O renderer de produção também passou na GPU física local com debug layer: pixels do modelo e fundo transparente, materiais, rotação, resize, hide/show, reload e preservação dos bindings do jogo. Esse fixture usa geometria decodificada sintética e não substitui a confirmação visual do NIF da armadura no jogo. Evidências: `nif-renderer-r4-tests.log` e `nif-renderer-r4-hardware.log`.

Pacote com 359 arquivos instalado no mod dedicado do MO2 com todos os hashes Data verificados e jogo fechado. HouseCARL confirmou bridge como vencedor no perfil de testes. Nenhuma mutação de inventário foi habilitada; a apresentação 3D é independente da integração autoritativa. O console anexado contém traces de teleporte do RemoteServer, sem diagnóstico do renderer NIF.

ZIP r4: `artifacts/AetheriusUI-Core-local-20261004-r4.zip`, SHA-256 `3fb57453bf6a5854c19cb7de2a8c431edd0b19b522edbfcc2198d32536cd67d8`. Confirmação pendente: desenho e interação com o NIF real da armadura no inventário dentro do Skyrim.

Servidor local reiniciado e pronto às 17:06:18 (PID 17628); Skyrim iniciado pelo perfil de testes às 17:06:54 (PID 15048). `skse64.log` confirmou AetheriusUIBridge.dll e MeridianUIPlugin.dll carregados corretamente nesta sessão. Logs de boot preservados em `evidence/run7`.

## Rodada r5: opacidade do preview e TAB no mapa

O usuário confirmou o aparecimento dos modelos em jogo, mas reportou partes transparentes/sobrepostas e TAB abrindo o radial sobre o mapa. Logs da sessão preservados em `evidence/run8-before-update`.

O shader usava alpha da textura difusa em materiais opacos, produzindo pixels translúcidos para o compositor mesmo com depth write e blending Opaque. Agora a textura só define cobertura quando há alpha property de blending/test; materiais opacos e sobreviventes de alpha test produzem alpha 1. Desenhos translúcidos geram pixels premultiplicados e usam AlphaBlend, com fundo RGBA zero. Corrigido também o alpha de 50% que chegava como 25% ao render target com NonPremultiplied.

Regressão antes da correção falhou na GPU física (“50 percent opacity stays 50 percent in compositor texture”); depois passou, incluindo material opaco com alpha difuso 0.25, opacidade efetiva 0.5 e duas superfícies sobrepostas com ordem de desenho invertida. A superfície verde da frente ocultou a vermelha de trás em ambas as ordens. CTest gráfico: 5/5; bridge: 1/1; UI/mapa/navegação: 23/23. Evidências: `nif-alpha-regression-before.log`, `nif-alpha-regression-after.log`, `nif-renderer-r5-tests.log`. Os testes usam geometria sintética no renderer de produção, não o NIF real do capacete.

Callback de TAB verifica MapMenu antes dos guards de pause/readiness do radial, oculta qualquer overlay residual e enfileira kHide para o mapa. Retorna comando consumido; o controle de teclas do Meridian também consome repeats e release desse pressionamento. OpenMainView recusa abertura enquanto MapMenu estiver aberto, incluindo solicitações tardias de foco. Atalho de controle recebe a mesma prioridade. Nenhuma mudança na autoridade de gameplay.

MeridianUI.dll/shaders e AetheriusUIBridge.dll/PDB recompilados, pacote de 359 arquivos instalado com Skyrim fechado e todos os hashes Data conferidos. ZIP `artifacts/AetheriusUI-Core-local-20261004-r5.zip`, SHA-256 `4dc16c4d837e2654c49a3764508f35cd097e7dc1202f6dfee1a20e56ea8f3bea`. Confirmação visual pendente: opacidade do capacete/armadura reais e TAB fechar somente o mapa.
