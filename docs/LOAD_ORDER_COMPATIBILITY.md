# Load order local

A origem é o perfil `AETHERIUS - GRAFICO - QUALIDADE`, em `C:/modOrganizer`. O perfil dedicado adiciona somente o mod UI de teste, preservando a ordem dos 424 plugins: 119 regulares e 305 light. São 413 marcados no plugins.txt e 11 masters/CC implícitos. A ordem foi comparada com `ScampServer.getEspmLoadOrder()` e todos os masters declarados foram verificados antes da cópia.

`runtime/data/aetherius-loadorder.json` contém nome, origem física, vencedor, tamanho, SHA-256, flags, tipo, índice e masters por plugin. `runtime/data/aetherius-scripts.json` contém a mesma proveniência para os 16.210 scripts vencedores. Sessenta BSAs participaram dos vencedores de scripts, além de fontes loose/Data/overwrite.

A advertência inicial sobre os BSAs vanilla foi resolvida copiando as INIs efetivas para o perfil de teste com configurações locais. A coleta final houseCARL dos scripts não teve warnings, itens omitidos ou truncamento.

Meridian e o client bundle são sobrescritos pelo mod dedicado; os mods originais permanecem preservados. A propriedade dos diretórios é verificada antes da implantação. Não foi criado ESP ou alterado registro de gameplay para fazer a UI funcionar.

Compatibilidade de arquivos/índices e abertura no loader não equivale à execução de todos os sistemas dos mods. NPCs estão desativados no teste; o host Papyrus usa allowlist vazia devido às incompatibilidades reproduzidas. Combate, quests, distribuições e scripts com dependências nativas do cliente necessitam auditorias próprias de owner/host.
