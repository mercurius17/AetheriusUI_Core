# Plano e auditoria inicial

O pacote é externo ao UI Core: `inventory`, `/inventory`, slot 4, SDK 1.x. Todos os arquivos produzidos ficam neste diretório; integrações são entregues como patches/overlays locais, sem modificar os checkouts de referência.

## Decisões

1. MySQL permanece autoridade. `characters.gold` é a única fonte de Gold. `character_inventory` permanece projeção agregada para compatibilidade; um agregado `character_inventory_state` representa instâncias, equipamento e descobertas. Ambos são atualizados na mesma transação. Não são dois inventários independentes. Após migração, escritores legados precisam ser redirecionados antes de habilitar mutações.
2. `inventory_transactions` continua o ledger de itens; acrescentar vínculo à operação e detalhes estruturados, sem perder histórico. `inventory_operations` armazena fingerprint/resultado persistentes. `inventory_outbox` registra obrigações de aplicação.
3. Locks de personagem em ordem crescente e idempotência transacional. O ID de operação vem do payload validado, porque o router não entrega messageId ao handler. Identidade é derivada do ator autenticado pelo host.
4. Snapshot paginado por revisão, com limite de bytes conservador; UI solicita páginas sequencialmente. Comando usa expectedRevision. Mudança externa invalida a visão.
5. Regras de domínio não invocam AddItem/RemoveItem no cliente. Aplicação usa uma projeção absoluta do inventário por revisão, nunca adição cega. Efeitos não idempotentes exigem adapter servidor com journal persistente; produção recusa capacidades sem essa garantia.
6. Catálogo é fornecido pelo servidor e validado. Não importar stats nem extras do browser. Catálogo de demonstração só existe no preview/testes, com marca explícita.
7. A versão atual do Core tem router privado e catálogo sempre indisponível. Entregar extensão pública pequena para registro/availability, mantendo transporte e sessão.
8. Preview 3D deve usar RenderLayer/NifView na view existente. Implementar o contrato local e a área interativa; suporte nativo só pode ser anunciado quando o bridge publicado fornecer as APIs e sua build tiver passado.

## Caminhos identificados

- UI: shell.js → bridge → aetheriusUiService → CustomPacket → AetheriusUiSystem.
- SQL: gamemode/inventory-service.js e core/transaction-service.js; commands.getActiveCharacterData fornece characterId; admin-service.hasPermission('view_audit') fornece autorização administrativa.
- Nativo: ActionListener.OnPutItem/OnTakeItem/OnDropItem/OnEquip/OnPlayerBowShot/OnCraftItem; MpObjectReference e MpActor persistem inventário no world state. Esses caminhos precisam de adapter unificado para evitar bypass do SQL.
- Cliente: sync/inventory.ts aplica snapshots com extras e worn/wornLeft. A comparação de extras atualmente ignora chargePercent/nome em alguns fluxos: incompatível com seleção segura por instância sem extensão.
- Combate experimental: AetheriusDamageFormula rejeita duas armas equipadas com mesmo baseId. Não liberar dual wield nesse modo sem resolver por instância.

## Ordem de entrega

1. Contratos, regras, validação e adapters de persistência.
2. Testes de transações, crash/restart, replay, transferências e autorização.
3. UI real do slot 4, prévia isolada, ações e estados de erro/pending.
4. Migração, bootstrap autenticado, extensão do Core e adapters dos escritores legados.
5. Packaging, regressões, matriz funcional e roteiro in-game.

## Gates que exigem ambiente externo

- Banco MySQL de integração: não usar credenciais locais nem executar migração em produção implicitamente.
- CommonLibSSE, spdlog e nlohmann_json para a build nativa; Skyrim/SKSE/Meridian para load/input/NIF.
- Adapter autoritativo de efeitos, projeção e interação precisa existir no host e demonstrar idempotência. Um ACK do cliente não satisfaz esse contrato.

Não declarar o pacote completo/validado in-game enquanto esses gates não forem comprovados.

## Revisão 0.2.0

Descarte agora destrói sem spawn; favoritos e hotkeys fazem parte do mesmo agregado autoritativo. Interface e contratos implementados nesta pasta. Sink nativo exclusivo Q/1–9 permanece bloqueado pela dependência CommonLibSSE ausente. Consulte FAVORITES_HOTKEYS.md para os pontos concretos de integração.
