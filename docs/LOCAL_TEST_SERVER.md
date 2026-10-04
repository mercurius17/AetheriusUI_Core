# Servidor local

Runtime: `C:/Code/Aetherius-MP-Teste/runtime`. UDP 7777 e HTTP 3000, configurados para localhost; offlineMode e identidade de teste 900001. O gamemode local não importa gamemodes de produção, `.env`, webhooks ou bancos remotos. A persistência é o driver file local em `runtime/world`; não é uma migração MySQL/PostgreSQL.

`prepare-local-runtime.cjs` exige a exportação `load-order-vfs.json` do houseCARL e compara o perfil atual, ordem, vencedores, masters, flags e capacidade de índices antes de copiar plugins. `stage-winning-scripts.cjs` exige `scripts-vfs.json` e `extraction-sources.json`, preservando o vencedor exato de cada PEX e seus hashes. As extrações de BSA foram feitas pelo houseCARL, sem modificar os arquivos originais.

Os scripts `start-local-server.ps1` e `stop-local-server.ps1` mantêm um registro do processo e verificam a identidade antes de encerrar. Use-os em conjunto; não reutilize um PID de um log antigo. Na execução assistida, o servidor foi iniciado pelo terminal da tarefa, com log em `runtime/server.log`.

Os testes nativos usam portas 17778/17779 e diretórios de persistência distintos (`native-validation-world` e `gameplay-validation-world`), para não alterar a sessão de jogo. `verify-gameplay-runtime.cjs` usa o addon real e transporte native mock. Isso comprova protocolo e persistência, mas não comportamento CEF ou input em jogo.

Foi necessária uma configuração nova `papyrusScriptAllowlist`. Ausente, preserva o comportamento histórico do fork. No runtime UI local, `[]` impede execução automática de scripts de mundo não auditados. Os 16.210 PEX continuam disponíveis e manifestados. A tentativa de executá-los indiscriminadamente reproduziu encerramento do host em `ccBGSSSE001_CritterSpawn`/referência 0x14 e erros de funções Papyrus não implementadas, incluindo GetCurrentDestructionStage. Não se afirma compatibilidade funcional de todos os scripts, NPCs ou quests dessa load order.

Nenhuma autorização de negócio depende da configuração offline do cliente: sessões e atores são emitidos/vinculados pelo servidor local. A configuração de login local exige simultaneamente o opt-in explícito, IP 127.0.0.1, porta 7777 e profileId válido. O diagnóstico opcional grava somente estados de transporte e erros técnicos limitados, sem envelopes ou session IDs.
