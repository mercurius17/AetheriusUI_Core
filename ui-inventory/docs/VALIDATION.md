# Registro de validação — 04/10/2026

## Atualização 0.3.1 — MAPA nativo pelo radial

71/71 testes do módulo e 14/14 do Core aprovados. Controlador do mapa checado contra as tipagens instaladas do Skyrim Platform; serviço real do cliente com a alteração compilado e exercitado com mod events/envelopes. Cobertura: slot 6 MAPA, preparação/ticket/confirmação, espera por foco CEF e menu Meridian, tecla remapeada, chamada única, replay, cancelamento, timeout, estado bloqueado, perda/substituição de sessão e preservação do transporte de inventário. Build completo do cliente em staging com webpack/ts-loader (transpileOnly; checagem de tipos separada do controlador). Não houve instalação nem verificação dentro do Skyrim. [Detalhes e pacote do cliente](MAP.md).

## Atualização 0.3.0 — feitiços

Indicadores de mãos: os 9 testes de controles da UI passaram após o ajuste para L / R / L R. Exercitam cliques nas duas ordens, remoção independente por mão e exclusão de poderes do indicador duplo, nos menus de feitiços e favoritos.

**61/61 testes do módulo e 14/14 do Core aprovados**, sintaxe de 37 arquivos JS/CJS validada. Abrange slot FEITIÇOS, nove categorias, associação ao mesmo menu de favoritos/hotkeys, hands/duas mãos, ownership, revisão, gritos bloqueados/desbloqueados, expiração e consulta de efeitos, API interna confiável e troca de módulo com cleanup/foco. O protocolo real do Core anuncia os dois módulos e compartilha alterações de favoritos. [Contrato e limites](SPELLS.md).

Prévia disponibilizada diretamente em `/?menu=spells`. Verificação HTTP e serviços locais não substituem revisão visual nem teste no jogo. Não houve nova validação visual de CSS nesta rodada. Nenhuma DLL, alteração em load order ou banco externo foi emitida.

## Alternância por clique

Após acrescentar equipar/desequipar pelo mouse: **48/48 testes do módulo e 14/14 do Core aprovados**, sintaxe dos 31 arquivos validada. Novos testes exercitam ambos os menus e cliques, conservação de pilhas no split/merge, slots fixos, magias nas duas mãos e poderes. E continua apenas equipando. Desequipar magias/poderes usa `unequipAbility` autoritativo, preservando conhecimento e favoritos.

## Atualização 0.2.0 — controles, favoritos e hotkeys

- `npm test`: **45/45 do módulo e 14/14 do Core**, após as alterações. Overlay frontend conferido pelos anchors e parsing; overlay do servidor compilado.
- `npm run check`: **31 arquivos** JS/CJS passaram na análise sintática.
- Testes novos: confirmação exata Sim/Não, foco padrão em Não, cancelamento sem mutação, destruição idempotente sem spawn, outbox antiga de drop bloqueada, E sem consumir, cliques por mão, F compartilhado, hover + dígito, persistência/restart e reassociação de hotkeys, merge/destruição/desfavoritar, magias/poderes e capability ausente; momentum/limites/reduced motion/dispose.
- Os testes da UI usam DOM mínimo e InventoryService/SQLite reais; não renderizam CSS. A política de segurança do navegador rejeitou a abertura da prévia local nesta rodada. Não houve nova conferência visual nem nova captura. As capturas e ações de browser abaixo são da versão anterior.
- Q e hotkeys 1–9 durante gameplay: contrato de input exclusivo entregue; **sink nativo não implementado nem compilado**. CommonLibSSE permanece ausente.
- Projeção física de destruição/equipamento/efeitos no Skyrim e MySQL de integração continuam pendentes.

## Executado anteriormente / base mantida

- Inventário: **45/45 testes aprovados** (domínio, persistência SQLite, replays, efeito/retry, paginação, segurança, integração, bloqueio de migração incompleta e ciclo de vida).
- UI Core: **14/14 testes originais aprovados**. A extensão de registro foi compilada via esbuild; teste usa `AetheriusUiSystem` real, sessão e envelopes, com replay concorrente.
- Class-System: **44/50 testes aprovados**, 2/6 suites completas aprovadas. Executado diretamente contra o checkout original, sem aplicar o inventário. Falhas: classes/resolution (false vs true), total de perks (350 vs 351), leveling/combat com awardedPlayers ausente, perkResolver unresolved/report (0 vs 162). Não corrigidas por estarem fora deste módulo. Não declarar regressão geral aprovada.
- Prévia via browser: radial real, seleção, busca, Backspace em busca, escolha de mão, equipamento (stack 3 → 2 + 1 equipada), consumo (poção 3 → 2), leitura e modal de livro. Revisões e respostas vieram do InventoryService. Dados e efeitos sintéticos.
- Configuração nativa: VS 2026/MSVC 14.51 detectados. CMake interrompido por ausência de `CommonLibSSEConfig.cmake`. Nenhuma DLL gerada, nenhuma alteração nativa emitida.
- `npm run check`: sintaxe aprovada para os 31 arquivos JS/CJS. `npm run package:meridian`: pacote gerado com manifest SHA-256.
- Layout medido no DOM em 2560×1440 e 3440×1440: sem overflow horizontal da página. Captura visual de 1920×1080 em `screenshots/inventory-1080.jpg`; não equivale a teste do input/renderer no jogo. Captura full-page nas resoluções maiores não esteve disponível no browser.

## Não executado / não comprovado

- Migração, locks e crash/recovery MySQL; nenhuma credencial usada e nenhum banco externo alterado.
- Load do plugin/SKSE/Meridian e ações no Skyrim; bridge 3D/controller; build completa dos projetos externos.
- Journal de efeitos nativos e references de mundo, fence de eventos/escritores existentes, importação de catálogo da load order e reconciliação de instâncias.
- Paridade completa vanilla (stats efetivos, favorites menu, peso dinâmico, ownership/quest authoritative, permissões de containers/comércio e efeitos externos).

Os testes usam runtime com receipts de demonstração. Persistência do estado/outbox SQLite sobrevive ao restart; a propriedade de receipt gameplay durável continua sendo requisito de produção, não conclusão do teste de demo.

O bootstrap de produção está deliberadamente fechado quando essas capacidades não existem. O pacote pode ser revisado e integrado; **não está pronto para ativação no servidor real**.

## Revisão visual anterior (antes de 0.2.0)

Layout reestruturado conforme as duas imagens de referência fornecidas pelo usuário. Lista compacta à esquerda, categorias por ícones, ficha à direita e área ampla de preview. Ações exercitadas novamente no browser; sem erros de console nesta execução. Detalhes e captura atual em `UI_LAYOUT.md`; a captura anterior `inventory-1080.jpg` documenta a primeira apresentação, não o layout atual.
