# Execução local — 04/10/2026

Etapas executadas: baseline, builds, transporte, manifesto Class/Party/Inventory/Spells, input e staging da load order. Evidências e limitações finais em VALIDATION_REPORT.md. Confirmação das últimas correções visuais ainda pendente.

1. Registrar baseline e testar Core, inventário, cliente Meridian e módulos consumidores.
2. Compilar bridge com CommonLibSSE-NG pinada e servidor nativo com MSVC 2022.
3. Atualizar router contra replay concorrente e integrar transporte às baselines atuais.
4. Integrar Class/Party do GameplayCore e carregar módulos externos por manifesto.
5. Resolver input/foco e snapshot de load order/VFS; preparar runtime isolado.
6. Empacotar, instalar em mod dedicado, iniciar servidor/SKSE e verificar logs/comportamento.

O cliente continua sem autoridade. Dados simulados não habilitam capacidades de produção.

Baseline executada: Core 14/14; inventário 71/71; cliente Meridian 25/25 após instalação pelo yarn.lock. Patches históricos não aplicam às baselines atuais e serão adaptados semanticamente. Alteração preexistente no Core: `.vscode/` untracked, preservada.

MSVC 2022 14.44.35207 e SDK 10.0.26100.0 disponíveis. CommonLibSSE-NG clonada em `C:/Code/Aetherius-MP-Teste/deps/CommonLibSSE-NG`, commit `39f9d07a6ffabea8fb559eee87ab7d27cd463e8a`. Dependências nativas existentes em outra build local serão consultadas como cache, sem editar aquela build.
