# Aetherius UI Inventory + Feitiços + Mapa — 0.3.1

Módulo externo `inventory`, rota `/inventory`, slot 4 do radial do Aetherius UI Core. Implementação da UI, regras de domínio, persistência transacional e contratos de integração. O código fica em `ui-inventory/`, dentro do repositório do Core; os checkouts upstream de referência permanecem sem alterações. Os scripts também aceitam a disposição anterior, como pasta irmã do Core, ou o caminho explícito em `AETHERIUS_UI_CORE`.

A versão 0.3.0 registra também `spells`, rota `/spells`, slot 2 **FEITIÇOS**, com as nove categorias solicitadas. Compartilha layout, controles por mão, favoritos e hotkeys com o inventário. Efeitos ativos são consultivos. [Menu de feitiços e integração](docs/SPELLS.md).

A versão 0.3.1 acrescenta `map`, rota `/map`, slot 6 **MAPA**. O clique no radial chama o controle nativo do jogo pelo cliente, após liberar o foco do CEF. O pacote inclui o cliente completo compilado com a alteração e o overlay TypeScript para revisão; a instalação/validação no Skyrim não foi realizada. [Fluxo, instalação e validação](docs/MAP.md).

A interface foi reestruturada conforme as novas referências: painel esquerdo com categorias por ícones, linhas compactas e colunas ordenáveis; área de visualização à direita e ficha do item abaixo. Favoritos e pergaminhos têm filtros próprios. Ouro, capacidade e ações permanecem no rodapé. [Layout e validação visual](docs/UI_LAYOUT.md).

**Estado: implementação parcial verificável, bloqueada para produção.** Não inclui DLL nem adapter nativo de efeitos com receipts persistentes. Não foi instalada no Skyrim, nem migrada uma base MySQL. A prévia usa itens sintéticos e não representa conexão com o jogo.

A versão 0.2.0 acrescenta destruição com Sim/Não, controles E/R/F/T e mouse, favoritos CEF compactos, hotkeys 1–9 persistentes, ícones de traço desenhado e scroll com inércia. Q e números durante gameplay dependem de um sink nativo exclusivo ainda não implementado. [Controles e integração](docs/FAVORITES_HOTKEYS.md).

## Executar localmente

Use Node 22.13 ou superior para testes e prévia (`node:sqlite`, experimental nessa versão). O serviço de produção não usa SQLite e declara Node >=18; validar a versão efetiva do host antes da instalação. Não é necessário `npm install` para este módulo. Prepare os checkouts cliente e servidor nas revisões descritas no [README do Core](../README.md), aplique os patches existentes e instale suas dependências em `referencias/repositories/aetherius-client/client` e `referencias/repositories/aetherius-server/server`. As regressões usam esbuild do servidor e TypeScript, webpack e ts-loader do cliente; esses checkouts e dependências não entram no Git.

```powershell
Set-Location 'C:\Code\Aetherius - SkyMP\AetheriusUI_Core\ui-inventory'
npm test
npm run check
npm run preview
```

A prévia abre em `http://127.0.0.1:4177/`: selecione **INVENTÁRIO** ou **FEITIÇOS** no radial. Acesso direto: `/?menu=spells` e `/?menu=favorites`. Seu banco é em memória, reiniciado com o processo. Ações passam pelo serviço do módulo; os efeitos de jogo são substituídos por um runtime de demonstração explicitamente marcado.

```powershell
npm run package:meridian
```

O resultado fica em `dist/meridian`, `dist/server-package` e `dist/client-package`, com hashes em `dist/manifest.json`. Não distribui a fonte Futura local, dados sintéticos, runtime SQLite, executáveis ou DLL. Contém uma cópia da UI do Core com os sete arquivos da interface compartilhada/mapa carregados, o overlay de troca entre módulos e subrotas, os dois arquivos de alteração do cliente e `Data/Platform/Plugins/skymp5-client.js` compilado com MAPA. Verificar direitos dos demais assets antes de redistribuição externa.

## Autoridade e auditoria

O browser envia intenção, ID de operação e revisão; nunca define jogador, saldo, preço, stats ou efeito. O servidor resolve personagem pelo ator autenticado, valida ownership/revisão e trava os agregados em ordem. A mesma transação grava estado, projeção SQL legada, Gold, ledger, resultado idempotente e outbox. Repetir uma operação não debita novamente; reutilizar o ID com outro payload falha.

O estado SQL representa a decisão canônica. `pending` significa que a aplicação durável no jogo ainda não foi comprovada. Um ACK do cliente não conclui a operação. Receipts persistentes e rejeição de projeções antigas são obrigações do adapter host; os receipts da prévia existem apenas em memória e não cumprem esse requisito de produção.

Logs de itens permanecem em `inventory_transactions`; Gold em `gold_transactions`. A ação `inventory/audit` exige a permissão real `view_audit`. Não foi criada uma tela administrativa. Rejeições de domínio transacionais entram em `inventory_alerts`; rejeições anteriores à transação precisam da observabilidade do router/host.

## Próximos passos obrigatórios para o servidor real

1. Fornecer catálogo confiável da load order, incluindo extras e regras de equipamento; reconciliar instâncias legadas.
2. Implementar o adapter nativo durável e redirecionar todos os escritores de inventário, Gold, equipamento e efeitos para a autoridade. O bootstrap recusa ativação sem essa comprovação.
3. Integrar contêineres, referências de mundo, comércio e tokens de interação. O store atual persiste agregados de personagens; os testes de coleta usam um segundo agregado de personagem. Não há suporte persistente de mundo/contêiner pronto.
4. Completar bridge Meridian de modelo 3D e input de controle; compilar com CommonLibSSE disponível.
5. Executar migração e testes de concorrência/crash em MySQL de integração; validar o checklist dentro do Skyrim antes de distribuir.

Detalhes: [instalação](docs/INSTALL.md), [contrato](docs/CONTRACT.md), [matriz funcional](docs/TEST_MATRIX.md), [validação](docs/VALIDATION.md), [plano](docs/PLAN.md) e [contrato nativo](integrations/native-capabilities.md).
