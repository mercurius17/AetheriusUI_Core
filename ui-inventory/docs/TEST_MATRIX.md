# Matriz das funções solicitadas

Legenda: **local** = implementado e exercitado em domínio/UI; não significa execução no Skyrim. **host** = requer integração real ainda ausente. Não houve validação in-game de nenhuma linha.

| ID | Função | Implementação / evidência | Pendência para jogo |
|---|---|---|---|
| 01 | Abrir inventário | Registro slot 4 e rota; radial real na prévia | Instalação do bootstrap |
| 02 | Categorias | Oito categorias, busca/filtro/ordenação | Catálogo real |
| 03 | Selecionar item | Detalhes por instância/revisão; seleção na prévia | Modelo nativo |
| 04 | Equipar | Split unitário, slots e projeção; teste/prévia | Inventory + Equipment duráveis |
| 05 | Desequipar | Remove slots e recombina stacks equivalentes; teste | Adapter nativo |
| 06 | Mão direita/esquerda | Diálogo e comandos por mão; teste/prévia | Bridge/combate |
| 07 | Dual wield | Instâncias distintas e exclusão de two-hand; teste | Restrição same-base no modo Aetherius |
| 08 | Favoritar | Estado canônico e indicação UI | CEF compartilhado; sink Q nativo pendente |
| 09 | Remover favorito | Mesma ação com false | CEF compartilhado; sink Q nativo pendente |
| 10 | Usar/consumir | Débito único e efeito em outbox; teste/prévia | Efeito gameplay durável |
| 11 | Comer ingrediente | Uma unidade; revela primeiro efeito; teste | Efeito/discovery no host |
| 12 | Ler livro/carta/nota | Leitura sem débito, chunks e modal; teste/prévia | Conteúdo trusted, bônus de leitura |
| 13 | Usar Spell Tome | Aprende uma vez e consome uma unidade; teste | Spellbook nativo |
| 14 | Equipar Scroll | Prepara sem débito; cast separado; teste | Equipamento e lançamento |
| 15 | Aplicar veneno | Fonte debitada, target equipado elegível; teste | Consumo de usos no combate nativo |
| 16 | Recarregar arma | Soul Gem, carga máxima e gem reutilizável; teste | Regra real/ExtraCharge nativo |
| 17 | Destruir (substitui dropar) | Sim/Não + débito e ledger permanente; sem spawn; testes | Projeção nativa sem DropItem |
| 18 | Empilhar | Comparação de extras; merge/split e lineage; teste | Sincronização real por instância |
| 19 | Escolher quantidade | Diálogo; transfer/sell/destroy; teste | Tokens/comércio/contêineres |
| 20 | Visualizar modelo 3D | Área e controller contratados | Bridge RenderLayer/NifView ausente |
| 21 | Rotacionar modelo | Controller pointer + câmera limitada | Não exercitado sem renderer |
| 22 | Zoom do modelo | Controller wheel + limites | Não exercitado sem renderer |
| 23 | Mostrar nome | Snapshot e UI; teste/prévia | Catálogo/nome custom real |
| 24 | Mostrar peso | Por item e total no resumo | Peso trusted dinâmico |
| 25 | Mostrar valor | Valor-base do catálogo | Regra de preço do comércio |
| 26 | Mostrar quantidade | Quantidade canônica por variante | Sincronização nativa |
| 27 | Mostrar Damage | Campo trusted do catálogo | Cálculo efetivo com stats/perks |
| 28 | Mostrar Armor | Campo trusted do catálogo | Cálculo efetivo com stats/perks |
| 29 | Mostrar efeitos | Enchantment e efeitos conhecidos; teste | Extração real de records/estado |
| 30 | Mostrar equipado | Estado e marca visual; teste/prévia | Equipment do host |
| 31 | Mostrar favorito | Estado e marca visual | CEF compartilhado; integração gameplay pendente |
| 32 | Capacidade de carga | Peso / carryWeight no resumo | Fonte dinâmica do ator |
| 33 | Mostrar ouro | Saldo canônico SQL no resumo; teste | Fence de todos os writers de Gold |

## Segurança e integridade exercitadas

Testes cobrem replay paralelo, fingerprint divergente, revisão obsoleta, ownership/autorização, quantidades inválidas, rollback após falha, Gold insuficiente, transferências conservativas, disputa de coleta, extras de stack, restart com outbox persistente e retry após ACK perdido. SQLite é um banco real usado nos testes, mas não comprova locks, SKIP LOCKED, DDL nem comportamento mysql2.

## Checklist de aceitação in-game (pendente)

Validar as 33 linhas com load order/pin registrados, SE/AE e resoluções 1920×1080, 2560×1440 e 3440×1440. Registrar keyboard/mouse/controller, abertura/fechamento repetidos, unload/resize/ESC, troca de personagem e reconexão. Testar duas cópias do mesmo baseId com extras distintos, equipamento de duas mãos/ammo/shield, quest/stolen, livros/tomos/scrolls, soul gems e poison.

Forçar destruição/coleta concorrente, comércio sem saldo, contêiner cheio, crafting/munição/rewards externos, crash antes/depois do commit SQL e antes/depois do receipt nativo. Comprovar ausência de dupes por conservação de quantidades/Gold, ledger correspondente e uma única referência/efeito por operação. Verificar falha fechada quando fence/token/capacidade nativa faltar. Medir inventários grandes: há paginação por bytes, mas não há virtualização da lista DOM nem benchmark de escala concluído.

## Controles e favoritos 0.2.0

Testes adicionais cobrem a mensagem exata, cancelamento sem mutação, E sem consumir, cliques left/right, F e mapeamento por hover + dígito; persistência de hotkeys 1–9, overwrite exclusivo, limpeza ao destruir/desfavoritar e redirecionamento após merge; magias desconhecidas negadas, slots de poder/magias e capability ausente; momentum, limites, reduced motion e disposal. Em gameplay ainda faltam Q/1–9 exclusivos, demonstração de receipt durável e teste visual da nova aparência.
