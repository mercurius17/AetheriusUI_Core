# Favoritos, destruição e controles — 0.2.0

Toda a implementação permanece em `ui-inventory`. Esta versão troca o descarte em mundo por destruição definitiva no domínio, acrescenta a rota CEF `/inventory/favorites` e o estado persistente de atalhos. Nenhum item real foi destruído e nenhum banco de produção foi alterado.

## Controles da interface

| Entrada | Inventário | Favoritos |
|---|---|---|
| E | Equipar automaticamente; não consumir/ler | Equipar item, magia ou poder |
| Mouse esquerdo | Selecionar e alternar equipar/desequipar na mão direita, quando aplicável | Mesma ação |
| Mouse direito | Selecionar e alternar equipar/desequipar na mão esquerda, quando aplicável | Mesma ação; suprime context menu |
| F | Alternar favorito | Remover favorito da lista compartilhada |
| R | Abrir confirmação de destruição | Mesma confirmação para itens |
| T | Invocar adaptador futuro de recarga do item encantado | Mesma extensão para itens |
| Q | Navegar para favoritos | Fechar CEF e devolver foco ao jogo |
| 1–9 | Sem mapeamento | Mapear o favorito selecionado/realçado pelo mouse |

Um número é associado a um favorito por vez; atribuir esse número a outro favorito substitui a associação. Remapear o mesmo favorito para outro número libera o número anterior. O número aparece ao lado do favorito. No menu aberto, pressionar um número **mapeia** o selecionado; durante gameplay, esse número **ativa** o associado por meio do adaptador exclusivo do host. Atribuir um atalho não usa o item nem altera sua quantidade.

Armaduras, escudos, armas de duas mãos, munição e poderes seguem seus slots; escolher uma mão não força um equipamento incompatível. Magias ocupam left/right; poderes ocupam power. Equipar uma magia desloca itens dessa mão; equipar uma arma de duas mãos libera magias nas duas mãos.

Clicar novamente no item equipado desequipa: o clique alterna apenas a mão correspondente para itens/magias de uma mão; armaduras, escudos, munição, armas de duas mãos e poderes alternam seus slots canônicos. Magias equipadas nas duas mãos podem ser removidas de uma mão mantendo a outra. A tecla E continua sendo apenas equipar. Todas as mudanças usam revisão e confirmação autoritativa do servidor; cliques são bloqueados enquanto uma operação estiver pendente. Desequipar não destrói itens nem remove favoritos ou habilidades conhecidas.

## Destruição

R e o botão DESTRUIR mostram exatamente:

> Você tem certeza que deseja descartar este item? Ele será destruído e não poderá ser obtido novamente.

Botões **Sim** e **Não**, com foco inicial em Não. O diálogo permite escolher a quantidade, preserva a instância/revisão mostradas e bloqueia refresh periódico enquanto estiver aberto. Cancelar ou fechar não envia mutação. Sim envia `destroy` com quantidade positiva e `confirmed:true`; isso representa intenção, não concede autorização.

O servidor valida personagem autenticado, propriedade, revisão, quantidade e restrições de missão/bloqueio. O commit debita o agregado, grava `inventory_transactions` com `action:destroy`, delta negativo e `details.permanent:true`, e agenda exclusivamente a projeção absoluta. Não agenda spawn, drop, referência de mundo ou objeto recuperável. `drop` foi removido dos handlers públicos. Outbox antiga de drop fica pendente com `LEGACY_DROP_REQUIRES_RECONCILIATION`; deve ser reconciliada administrativamente antes de atualizar uma instalação existente, sem reescrever automaticamente decisões já commitadas.

A projeção nativa deverá remover o item sem chamar a operação vanilla que cria uma referência de chão. Ela ainda não foi implementada neste checkout; commit SQL pending não comprova remoção no jogo.

## Autoridade de favoritos e hotkeys

Itens usam `favorite` na instância. O catálogo trusted `abilities` passado a `createInventory` descreve `{key,name,kind:'spell'|'power',effects?}` com chave estável Plugin.esm/esp/esl:FormID. Ele não ensina habilidades: `knownSpells`/`knownPowers` precisam conter a habilidade antes de favoritar ou equipar. Esses campos e sua importação devem ser preenchidos por sistemas de servidor autorizados, nunca por snapshots do browser.

O mesmo JSON persistente do personagem guarda `favoriteAbilities`, `equippedAbilities` e `hotkeys`. Não há segundo inventário/favoritos. Registros de mapeamento e equipamento de habilidades são auditados no resultado persistente de `inventory_operations` (`favoriteChange` com before/after); o ledger de itens continua reservado a records de itens. Não há nova tela de auditoria administrativa nesta entrega.

`favoritesSnapshot` pagina itens favoritados e habilidades conhecidas/favoritadas, junto de `hotkeys`. `setHotkey` valida o `favoriteId` exato. `activateHotkey` resolve a associação dentro da mesma transação, revalida ownership/favorito e escolhe uma ação permitida no servidor. Equipáveis são equipados, poções/alimentos/ingredientes são consumidos, livros comuns são lidos, magias/poderes são equipados. Itens sem ação rápida definida recusam a ativação; ações que exigem outro alvo ou contexto continuam pelo inventário. Remoção, destruição e desfavoritar limpam bindings; merge redireciona bindings para a instância sobrevivente.

## Integração Q e números durante gameplay — pendente

`integrations/favorites-input-adapter.cjs` define um **novo contrato local**, não uma API comprovada do SkyMP. O host precisa implementar `registerExclusiveControl`, `registerExclusiveKey`, `canOpen`, `showMainView`, `executeMainView` e `activateHotkey`. O sink deve consumir Favorites/Q **antes** do menu vanilla, respeitar controles remapeados, gating de diálogo/loading/console, autorepeat, foco CEF e conflitos de números. Não basta observar `buttonEvent` e depois fechar o menu vanilla.

`showMainView(callback)` usa a MainView existente e só chama o callback após foco concedido, sessão e navegação do Core prontas. O callback invoca `window.AetheriusInventory.openFavorites()`. O adaptador não cria outra view. `host.activateHotkey(slot)` deve enviar `inventory/activateHotkey` autenticado, com operationId seguro e revisão atual, tratar respostas pending/rejected/timeouts e recuperar status; um simples comando cliente de equip/consume não satisfaz a autoridade. Receipts são persistentes no host. Quando CEF estiver focado, números chegam ao frontend para mapeamento, sem ativação gameplay paralela.

O pacote acrescenta `openModule(id,route)` ao **shell copiado** por um overlay com anchors verificados; só abre rotas registradas. Os repositórios de referência permanecem sem edição. A abertura Q por DOM serve à prévia focada; não intercepta teclas do jogo com CEF sem foco. A interceptação nativa Q/1–9 permanece pendente: falta CommonLibSSE para compilar o sink e nenhuma DLL foi produzida.

`native.supports('abilityEquip')` exige que `projection` projete também `equippedAbilities`. A outbox recebe os registros trusted em `effect.abilities`, com chaves estáveis a resolver no host. Aplicar sempre a revisão mais recente, persistir receipt junto do estado gameplay, preservar o spellbook autorizado e não transformar uma projeção de favorito em grant de magia.

T chama `window.AetheriusInventoryRecharge.open({itemId,key,revision})` quando existir. Esse ponto não debita gems nem envia `recharge` automaticamente. A regra server-side prévia de Soul Gem permanece disponível pelo fluxo explícito de alvo; a extensão T ainda será desenvolvida.

## Apresentação e validação

Ícones vetoriais originais de traço irregular e contornos, compartilhados entre inventário e favoritos. Favoritos usa painel pequeno e transparente à esquerda; detalhes/colunas/rodapé amplo ficam ocultos. Selecionados/equipados usam **#69CF99** e negrito. A roda acumula velocidade e desacelera por animação; inversão de direção zera a velocidade anterior, limites encerram o movimento e reduced motion usa deslocamento imediato. Seleção, troca de rota e unmount cancelam a inércia.

Testes com serviço real e SQLite verificam os comandos da UI através de um DOM mínimo de teste, persistência/restart, concorrência, replay, bloqueios, destruição sem spawn, reassociação/limpeza de hotkeys, magias/poderes e dinâmica de scroll. Não renderizam CSS. Nesta rodada a política de segurança do navegador bloqueou a abertura da prévia local; não há captura visual nova nem comprovação de input/renderer no Skyrim.
