# Alterações de runtime preservadas nos dois repositórios

Snapshot de 04/10/2026 da implementação e correções locais do Aetherius UI. Este diretório é versionado em AetheriusUI_Core; uma cópia idêntica é versionada em AetheriusGameplayCore em `integrations/ui-runtime-changes/`. Não são checkouts completos nem submódulos. As licenças dos projetos de origem continuam aplicáveis e estão junto a cada snapshot.

| Origem | Baseline exata | Conteúdo |
|---|---|---|
| AetheriusRP/aetherius-server | `a89b2e665bb5821ecd645bc6f3b66213e65f54ef` | Transporte UI, provider de inventário/feitiços em consulta, bindings nativos, validação e build. |
| AetheriusRP/aetherius-client | `8d1dd4e97e1f26f80b360af8e0a0cc5ff14e3523` | Transporte Meridian/SKSE, sessão, fila de packets no update e testes. |
| heathbrownkeyworks/MeridianUI | `5707877322c85a1bd1c2e3309487f266d0647ca9` | Foco/input, URLs de assets, preview NIF, fallback gráfico e correções de alpha. |

`manifest.json` contém URL, baseline, hash do patch e hashes dos arquivos modificados/adicionados. `changes.patch` inclui arquivos novos e alterações tracked, podendo ser aplicado diretamente. `files/` preserva a versão completa dos arquivos alterados para consulta. Arquivos removidos estão indicados no manifesto. Nenhum commit nos três repositórios externos foi necessário para produzir este snapshot.

## Aplicação

Prepare um checkout dedicado e limpo de cada origem na baseline indicada. Instale também seus submódulos/dependências conforme o projeto. Na raiz deste snapshot, para um checkout do servidor:

```powershell
git -C C:\checkouts\aetherius-server rev-parse HEAD
git -C C:\checkouts\aetherius-server apply --check "$PWD\aetherius-server\changes.patch"
git -C C:\checkouts\aetherius-server apply "$PWD\aetherius-server\changes.patch"
```

Repita para `aetherius-client/changes.patch` e `MeridianUI/changes.patch`. Não aplique juntamente os patches históricos `integrations/aetherius-*.patch`, que têm outras baselines. As cópias nos dois repositórios representam a mesma entrega: aplique apenas uma delas a cada checkout.

O script `AetheriusUI_Core/scripts/snapshot-runtime-changes.cjs` gera os dois snapshots e verifica os patches contra as baselines usando índices Git temporários, sem alterar o índice real dos repositórios externos. O build completo exige também o bridge/frontend do Core e a integração Class/Party do GameplayCore. Não há DLL, Node addon, CEF, node_modules, banco de jogadores ou instalação MO2 neste snapshot.

O estado atual e os critérios para concluir a implementação estão nos documentos CURRENT_STATE/REMAINING_IMPLEMENTATION do Core e em `docs/ui-integration/` do GameplayCore. Builds locais continuam dependentes dos caminhos/cache registrados em BUILD_AND_DEPLOY.md; portar o build para uma máquina limpa é uma pendência explícita.
