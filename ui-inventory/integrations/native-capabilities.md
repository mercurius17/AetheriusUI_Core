# Contratos do adapter autoritativo

`gamemode-runtime.cjs` integra APIs comprovadas (`commands.getActiveCharacterData`, `admin.hasPermission('view_audit')`) ao serviço. O parâmetro `native` é um contrato NOVO deste pacote. Não existe `mp.inventoryApplyOnce` comprovada no checkout e não é presumida.

## Requisitos de native.applyOnce(receipt, effect, catalog)

- `projection`: substituir a projeção absoluta do personagem a partir da revisão canônica, incluindo native Inventory **e** Equipment. A binding existente de equipment só possui Get. `mp.set(actor,'inventory',...)` isolado não satisfaz equipamento autoritativo/combate.
- Bloquear uma projeção antiga se uma revisão mais nova já tiver sido aplicada. Leitura do SQL mais recente reduz, mas não elimina a corrida entre workers; a verificação é obrigatória no commit nativo.
- Efeitos (`consume`, `learnSpell`, `readEffect`, `castScroll`): aplicar somente o efeito lógico, sem debitar o item uma segunda vez. Persistir receipt e resultado com a alteração do estado gameplay. Papyrus via cliente não fornece essa garantia.
- `destroy`: não é efeito de spawn. A projeção remove o saldo nativo sem DropItem/referência de chão. Ações drop antigas da outbox ficam bloqueadas para reconciliação administrativa.
- `abilityEquip`: capability que confirma que projection inclui equippedAbilities e resolve effect.abilities por chave estável trusted; slots left/right/power são aplicados com receipt e revisão. Não concede habilidades desconhecidas.
- `applyOnce` resolve corretamente personagem offline/online e persistência. Uma exceção deixa a outbox pendente; nenhuma restauração de itens é disparada por ACK ausente.
- `supports(type)` só retorna true para efeitos com essas garantias implementadas e verificadas.

## Interações e fence

`interactions.validate(actor,command,lockedStates)` valida token emitido pelo servidor, usuário/ator atual, expiração, célula/mundo, distância e permissões. Devolve um contexto trusted de collect, cast, transfer ou sell. Para transfer/sell/collect fornece characterId e expectedRevision da outra ponta; preço nunca vem da UI.

`fence.verify()` comprova que chamadas legadas AddItem/RemoveItem, mensagens nativas, jobs, comércio, contêineres, crafting, munição e ferramentas administrativas foram redirecionadas. Não implementar com `() => true` sem integração. O bootstrap recusa registro de produção quando não existe fence.

`previewToken` é um token local associado ao item selecionado pelo servidor/cliente autenticado. O bridge resolve modelo autorizado e apresenta `window.AetheriusInventoryPreview` com show/hide/rect/camera/clear. O Core atual não fornece essa extensão; o controller relata indisponibilidade quando ausente.

## Limitação concreta desta entrega

O domínio e a UI implementam suas ações; esse adapter nativo persistente ainda não está disponível no checkout. O pacote não deve ser habilitado para mutações no servidor real até ele existir. Arquivos de demonstração/testes exercitam o contrato com projeção e receipt de teste; isso não prova efeito no Skyrim.

Q e números 1–9 usam o contrato NOVO `favorites-input-adapter.cjs`: não há vínculo nativo implementado. Veja `docs/FAVORITES_HOTKEYS.md` para sink exclusivo, foco da MainView existente e transporte autenticado de activateHotkey.
