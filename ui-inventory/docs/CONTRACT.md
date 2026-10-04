# Contrato v1

Módulo `inventory`, rota `/inventory`, radial 4; registro pelo SDK real do Core 1.x. Usa `context.request('inventory',action,payload)` e envelopes do transporte existente. Identidade vem de `context.actorId` autenticado, resolvida novamente após aquisição dos locks.

## Consultas

| Ação | Payload | Resultado |
|---|---|---|
| snapshot | offset opcional; expectedRevision opcional | schemaVersion, revision, catalogPin, summary, items, nextOffset |
| favoritesSnapshot | offset/expectedRevision opcionais | snapshot de favoritos + habilidades + hotkeys |
| itemDetails | itemId, expectedRevision; textOffset opcional | item, description, enchantment, previewToken, text e cursor |
| operationStatus | operationId | resultado persistido e status; unknown se inexistente |
| audit | characterId/operationId/itemId/action/after/limit/from/to opcionais | linhas do ledger de itens, cursor nextAfter; somente view_audit |

Snapshots têm até 40 itens/página e orçamento de 11.500 bytes UTF-8; details e audit têm o mesmo orçamento. Datas de audit são UTC ISO; limite até 50. O limite do envelope Core é 16 KiB e seu timeout é 8 segundos. Não transportar modelos, grandes textos ou catálogo no envelope. Livro vem em chunks de até 2.000 caracteres, sem separar surrogate pair. A UI renderiza texto como dado; não executa HTML/scripts de livros.

## Mutações

Todas exigem `operationId` e `expectedRevision`; campos adicionais são allowlisted. Quantidades são inteiros positivos, IDs até 100 caracteres, hand é left/right/auto.

| Ação | Campos adicionais |
|---|---|
| equip / unequip / equipScroll | itemId, hand |
| setFavorite | itemId, favorite boolean |
| consume / read / learnTome | itemId |
| applyPoison / recharge | itemId da fonte, targetItemId |
| destroy | itemId, quantity, confirmed obrigatoriamente true |
| transfer | itemId, quantity, interactionId |
| equipAbility / unequipAbility | abilityId, hand |
| setAbilityFavorite | abilityId, favorite boolean |
| setHotkey | favoriteId, slot inteiro 1–9 |
| activateHotkey | slot inteiro 1–9 |
| collect | worldItemId, interactionId |
| castScroll | itemId, interactionId |

O servidor rejeita campos extras. `interactionId` é referência a contexto emitido/validado pelo servidor; não autoriza a UI a informar preço, destino, célula ou efeito. Cast e collect são integrações host, sem botões genéricos que inventem contexto. Preparar scroll não consome o pergaminho; o lançamento autorizado consome uma unidade.

## Operação e falhas

Chave persistente: `(characterId,operationId)`; SHA-256 do comando canônico detecta reutilização com payload diferente. `correlationId` é ligação de diagnóstico; o cache volátil do Core não é a garantia transacional. Nunca tratar timeout como cancelamento: consultar operationStatus. A UI mantém a ação pendente e não repete automaticamente uma mutação cujo resultado não conhece.

Estados: `rejected` (sem alteração), `pending` (SQL commitado, aplicação gameplay pendente), `applied` (outbox concluída por adapter durável). `unknown` não prova rejeição nem reversão. Principais erros: INVALID_PAYLOAD, FORBIDDEN, REVISION_CONFLICT, ITEM_NOT_OWNED, ITEM_LOCKED, INSUFFICIENT_ITEMS, INSUFFICIENT_GOLD, IDEMPOTENCY_CONFLICT, ACTION_UNAVAILABLE, EQUIPMENT_UNSUPPORTED e NOT_MIGRATED.

Qualquer instância com `provenance.reviewRequired` bloqueia todas as mutações e projeções do agregado com NOT_RECONCILED, inclusive grants server-only. Consultas permanecem disponíveis. Isso evita substituir o inventário real por uma migração que ainda não possui os extras reconciliados.

Locks são ordenados por ID do agregado. Transferências preservam quantidade/saldo no mesmo commit. Rejeições do domínio não persistem clones parcialmente modificados. Outbox usa lease de 30 segundos e retry após 10 segundos; receipt persistente do host precisa sobreviver a crash e aplicação duplicada. Aplicação da projeção também precisa rejeitar revisões antigas no lado nativo.

Empilhamento considera extras, propriedade, nome, carga, enchantment, favorito e equipamento. Estado vivo guarda até 128 entradas recentes de merge; a genealogia completa fica no ledger persistente. Gold usa `characters.gold`, com eventos em `gold_transactions`; não aceitar Gold como item baseId 15.

## Extensões locais

`window.AetheriusInventoryInteraction.current(action)` fornece token ao frontend quando uma interação real existir. `window.AetheriusInventoryPreview` é o contrato do bridge local de 3D. Nenhuma dessas extensões existe comprovadamente no Core atual; sua ausência não é mascarada pela UI.

`trusted-movements.cjs` é uma API server-only de grants, remoções e Gold com origem allowlisted. Não é handler de browser. O integrador deve manter essa fronteira e impedir caminhos paralelos que escrevam diretamente no SQL ou no inventário nativo.

`drop` deixou de ser um comando público. `destroy` não cria objeto no mundo. `favoriteId` é `item:<instanceId>` ou `ability:<stableKey>`; o slot resolve o destino no servidor. Ver `FAVORITES_HOTKEYS.md` para projeção de habilidades, auditoria de operações e integração nativa Q/1–9.
