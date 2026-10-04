# Integração e instalação

## Bases inspecionadas

- `AetheriusUI_Core`: `470526a24a003d5452802f90933c323c3bc4e300`.
- `AetheriusClassSystem`: `2406c3d680c4ceddcea70f7b202deba010af3360`.
- Código SkyMP/gamemode consultado em `AetheriusUI_Core/referencias/repositories`.

O pacote depende dessas APIs e anchors; uma versão diferente requer nova auditoria. Não instala outro UI Core, HUD, Main View nem DLL de SKSE.

## Ambiente de integração

1. Faça backup do banco, diretório Meridian e fonte do Core. Use uma cópia MySQL 8 com InnoDB; não aplicar este roteiro diretamente em produção.
2. Execute `npm test`, `npm run check` e `npm run package:meridian` nesta pasta.
3. Revise `integrations/overlays/aetherius-server/server/ts/systems/aetheriusUiSystem.ts`. A alteração acrescenta registro público de módulos e disponibilidade ao Core. Aplique ao caminho correspondente do projeto de servidor e compile pelo processo existente. O teste de integração já exercita essa classe com envelopes reais do Core, sem simular o router.
4. Forneça o `db` existente: `query(sql,params)` retorna linhas; `getConnection()` retorna conexão compatível com mysql2, `beginTransaction`, `commit`, `rollback`, `release` e `query` retornando `[rows]`.
5. Execute `preflight(db)` e `schema(db)` exportados por `scripts/migrate.cjs`. O preflight recusa schema divergente, engine diferente de InnoDB e saldos legados duplicados. DDL MySQL não é uma transação reversível: manter backup e testar restauração.
6. Interrompa e redirecione escritores legados. Para cada personagem, invoque `migrateCharacter(db,catalog,characterId,{carryWeight,backup,legacyWritersStopped:true})`. `backup` deve efetivamente persistir a cópia recebida. Gold é lido de `characters.gold`; IDs/quantidades vêm do SQL, nunca do cliente. Itens migrados ficam bloqueados até reconciliação confiável dos extras/quest/ownership. O procedimento de revisão/desbloqueio ainda deve ser implementado no host.
7. Crie `Catalog` a partir de registros confiáveis e pin da load order. Os registros `Preview.esm` em `test-support` não entram no servidor. Não há importador automático de catálogo nesta entrega.
8. Vincule `createGamemodeRuntime` às APIs reais de commands/admin, adapter `native`, validação de interações e fence. Leia `integrations/native-capabilities.md`; funções que simplesmente retornam true não atendem os requisitos.
9. Invoque `registerInventory(coreUiSystem,{db,records,abilities,pin,expectedPin,runtime})` do bootstrap confiável. Guarde o retorno e execute `unload()` no shutdown/reload. A assinatura real do factory está em `server/index.cjs`.
10. Adapte chamadores legados com `legacy-inventory-adapter.cjs` e `trusted-movements.cjs`: não expor grants ao browser. Crafting, munição, rewards, comércio, comandos administrativos e eventos nativos devem compartilhar a mesma autoridade. Os adapters não são aplicados automaticamente.
11. Após validar o host, copie o conteúdo de `dist/meridian/Data/MeridianUI/aetheriusui` sobre a instalação correspondente, preservando o mecanismo existente de empacotamento do Core. Não substitua o shell por uma segunda view.

## Bloqueios atuais

- O Core não expõe `window.AetheriusInventoryPreview`; o controller informa indisponibilidade. Implementar show/hide/rect/camera/clear com RenderLayer/NifView na view existente, resolução autorizada e descarte de recursos. Validar carga, resize, câmera, fechamento e troca rápida de seleção.
- A binding de Equipment disponível é somente leitura. Substituir apenas inventory não comprova equipment/combate. Também verificar unidade de `ExtraCharge`/`chargePercent` no adapter; o nome do campo não prova porcentagem.
- A configuração nativa detectou MSVC 14.51, mas falhou ao localizar `CommonLibSSEConfig.cmake`. Não foi emitido C++ nem gerada DLL sem essa dependência.
- Não há fonte autoritativa dinâmica de Carry Weight nem interceptação Q/1–9 integrada no jogo. O agregado armazena esses valores; o host precisa atualizar/sincronizar os mecanismos do jogo.
- Dual wield de armas do mesmo baseId é recusado no modo de combate Aetherius devido à regra atual do combate; o modo legacy tem regra por instância no domínio.

## Reversão

Desabilite o módulo e interrompa as mutações antes de restaurar código ou banco. Não reverta apenas a UI enquanto writers continuam usando o novo estado. Restaure backup consistente de todas as tabelas alteradas; preserve ledger/outbox para investigação e reconcilie efeitos já aplicados. Não há rollback automático de efeitos de jogo neste pacote.

## Atualização 0.2.0

Revisar `FAVORITES_HOTKEYS.md`. O shell empacotado inclui overlay frontend para `openModule(id,route)`, sem editar a referência Core. Importar magias/poderes conhecidos e favoritos por fonte trusted, configurar `abilities`, fornecer suporte durável `abilityEquip` e vincular o sink exclusivo. Reconciliar jobs antigos de drop antes de ativar; esta versão não os aplica. Os novos campos ficam no JSON de estado existente, sem DDL adicional. Não copiar os adapters como se fossem APIs já presentes no host.
