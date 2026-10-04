# Aetherius UI Core

Base de interface modular para o Aetherius/SkyMP, com shell persistente, HUD passivo, contrato versionado entre cliente e servidor e um adaptador nativo para Meridian.

> **Estado local (04/10/2026):** bridge CommonLibSSE-NG e Meridian compilados/carregados no Skyrim AE 1.6.1170. Usuário confirmou radial/ícones/animações, CLASSE/GRUPO, consulta de INVENTÁRIO/FEITIÇOS, mapa nativo e aparecimento de modelos 3D. As últimas correções de opacidade e TAB fechar apenas o mapa ainda aguardam confirmação visual. Mutações de gameplay permanecem bloqueadas até os adapters autoritativos; TrueHUD controla as barras de atributos.

Consulte primeiro [estado atual](docs/CURRENT_STATE.md) e [implementação restante](docs/REMAINING_IMPLEMENTATION.md), depois [validação](docs/VALIDATION_REPORT.md), [build/implantação](docs/BUILD_AND_DEPLOY.md) e [integração GameplayCore](docs/INTEGRATION_GAMEPLAY_CORE.md). As alterações atuais de server/client/Meridian estão versionadas em [runtime-changes](integrations/runtime-changes/README.md), com cópia no GameplayCore, fontes, patches completos e hashes.

## O que há aqui

- `shared/`: protocolo, navegação, catálogo, registry de módulos e store de revisão.
- `sdk/`: cliente local, envelopes e router genérico do servidor.
- `frontend/`: shell, HUD, estilos, ícones originais e fixtures de demonstração.
- `native/`: consumidor SKSE do Meridian em C++ e seu CMake.
- `integrations/`: snapshot atual de server/client/Meridian, manifesto local de módulos e patches históricos identificados por baseline.
- `docs/`: arquitetura, protocolo, módulos, segurança, input, auditorias e decisões técnicas.
- `tests/`: testes de contrato do Core.
- `ui-inventory/`: inventário autoritativo, feitiços, favoritos compartilhados/hotkeys e abertura do mapa nativo pelo radial TAB, com UI CEF, persistência, adapters, testes e empacotamento.

## Inventário, feitiços, favoritos e mapa

As interfaces e contratos estão em [`ui-inventory/`](ui-inventory/README.md), incluindo controles de equipamento por mão, feitiços/favoritos/hotkeys e destruição com confirmação. Essas ações dependem do adapter autoritativo e permanecem desabilitadas no provider local de consulta. **MAPA**, no slot 6 do TAB, libera o foco CEF e abre o MapMenu pelo bridge SKSE. O preview 3D é apresentação local de um item confirmado pelo servidor.

Para testar, gerar o pacote ou abrir a prévia, prepare os checkouts upstream e dependências descritos abaixo e execute `npm test`, `npm run check`, `npm run package:meridian` ou `npm run preview` em `ui-inventory/`. A prévia fica em `http://127.0.0.1:4177/`. Os overlays são gerados dentro do módulo; os scripts não instalam alterações no jogo automaticamente.

O módulo ainda exige o adapter nativo durável, a integração exclusiva de Q/1–9 durante gameplay, migração e validação MySQL e testes dentro do Skyrim antes de produção. Consulte [integração](ui-inventory/docs/INSTALL.md), [favoritos/hotkeys](ui-inventory/docs/FAVORITES_HOTKEYS.md), [feitiços](ui-inventory/docs/SPELLS.md), [mapa](ui-inventory/docs/MAP.md) e [validação](ui-inventory/docs/VALIDATION.md).

## Integração com os repositórios Aetherius

Use [integrations/runtime-changes](integrations/runtime-changes/README.md) para a entrega atual, baseada em server `a89b2e6`, client `8d1dd4e` e Meridian `5707877`. Os checkouts completos de referência não são incorporados; apenas as alterações necessárias estão preservadas.

### Patches históricos

A tabela e os comandos abaixo pertencem à integração anterior. Não os aplique juntamente com o snapshot atual.

| Repositório | Revisão-base usada | Patch |
|---|---|---|
| `AetheriusRP/aetherius-client` | `5a7368719f37e89762df4ad010ac691deeb51d94` (`main`) | [`integrations/aetherius-client.patch`](integrations/aetherius-client.patch) |
| `AetheriusRP/aetherius-server` | `c97fb3fe8b1e382d1e87aa09ca0ccf4c3b8d4c29` (`main`) | [`integrations/aetherius-server.patch`](integrations/aetherius-server.patch) |

Com os dois repositórios já clonados e posicionados nessas revisões, aplique cada patch na raiz do checkout correspondente:

```powershell
git -C C:\caminho\aetherius-client apply C:\caminho\AetheriusUI_Core\integrations\aetherius-client.patch
git -C C:\caminho\aetherius-server apply C:\caminho\AetheriusUI_Core\integrations\aetherius-server.patch
```

O client envia envelopes pelo `CustomPacket` reliable existente. O server cria a sessão depois de `spawnAllowed`, valida tamanho, esquema, sessão e deduplicação, e despacha para handlers registrados usando a identidade autenticada do contexto do servidor. `core.echo` só fica disponível com `AETHERIUS_UI_DEMO=1`.

## Fonte

O shell e o HUD usam `futura-book-bt.ttf` no checkout de desenvolvimento. A fonte foi fornecida para esta implementação, mas não veio acompanhada de licença de redistribuição; por isso os arquivos `.ttf` são mantidos localmente e ignorados pelo Git. Para reproduzir a tipografia, obtenha uma cópia com direitos de uso e coloque-a em:

```text
frontend/Data/MeridianUI/aetheriusui/fonts/futura-book-bt.ttf
```

O arquivo de referência e os documentos de entrada ficam em `referencias/` no checkout local e também não são enviados ao repositório público por padrão.

## Prévia no Live Server

Para conferir o shell no Live Server do VS Code, abra `frontend/Data/MeridianUI/aetheriusui/index.html`. Assets demonstrativos ficam em `frontend/test-fixtures/`, fora de Data, e não entram no pacote do jogo. Fixtures/previews não comprovam dados reais ou capacidades autoritativas. Consulte [`frontend/test-fixtures/README.md`](frontend/test-fixtures/README.md).

## Validação registrada

- Core: 17/17; UI/mapa/navegação: 23/23; cliente Meridian: 28/28 na integração.
- Bridge: compilado/carregado e 1/1 CTest; renderer: 5/5 CTest e regressões de alpha/occlusão na GPU física.
- Servidor nativo/TypeScript e cliente compilados; host com load order local validou consultas e isolamento.
- GameplayCore ClassSystem: build aprovado, 49/55 testes com seis falhas preexistentes documentadas.
- A confirmação visual das correções finais de opacidade/TAB ainda está pendente.

Os detalhes e limites estão em [`docs/REPOSITORY_AUDIT.md`](docs/REPOSITORY_AUDIT.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e [`docs/TEST_MATRIX.md`](docs/TEST_MATRIX.md).

## Licenciamento

Este repositório não declara uma licença de código. Confirme a titularidade e escolha uma licença antes de reutilizar ou redistribuir o conteúdo. A fonte não é incluída no commit público. A captura de jogo fornecida para a prévia e a logo do servidor usada no cabeçalho estão em `frontend/Data/MeridianUI/aetheriusui/preview/` e `frontend/Data/MeridianUI/aetheriusui/brand/`.
