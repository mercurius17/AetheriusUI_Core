# Aetherius UI Core

Base de interface modular para o Aetherius/SkyMP, com shell persistente, HUD passivo, contrato versionado entre cliente e servidor e um adaptador nativo para Meridian.

> **Estado:** implementação de integração em andamento. O build do cliente e do servidor e a suíte do Core passaram no ambiente de desenvolvimento. O adaptador nativo e o comportamento dentro do jogo ainda precisam de validação no runtime-alvo.

## O que há aqui

- `shared/`: protocolo, navegação, catálogo, registry de módulos e store de revisão.
- `sdk/`: cliente local, envelopes e router genérico do servidor.
- `frontend/`: shell, HUD, estilos, ícones originais e fixtures de demonstração.
- `native/`: consumidor SKSE do Meridian em C++ e seu CMake.
- `integrations/`: patches para conectar este Core às revisões atuais de `aetherius-client` e `aetherius-server` registradas abaixo.
- `docs/`: arquitetura, protocolo, módulos, segurança, input, auditorias e decisões técnicas.
- `tests/`: testes de contrato do Core.

## Integração com os repositórios Aetherius

As alterações do client e do server são distribuídas como patches pequenos. Os checkouts completos de referência ficam fora deste repositório; eles não são incorporados como submódulos nem cópias de upstream.

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

## Validação registrada

- Core: 14 testes aprovados.
- Cliente Aetherius: `yarn build` aprovado.
- Servidor Aetherius: `npm run build-ts` aprovado.
- TypeScript estrito do Core e verificações de sintaxe JavaScript aprovados.
- Native: compilação não concluída no ambiente; a configuração do Meridian/CommonLibSSE e uma cadeia C++ compatível ainda são necessárias.
- Não houve validação in-game de foco, TAB, WASD/corrida, mouse-look, renderização ou empacotamento.

Os detalhes e limites estão em [`docs/REPOSITORY_AUDIT.md`](docs/REPOSITORY_AUDIT.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e [`docs/TEST_MATRIX.md`](docs/TEST_MATRIX.md).

## Licenciamento

Este repositório não declara uma licença de código. Confirme a titularidade e escolha uma licença antes de reutilizar ou redistribuir o conteúdo. A fonte e os materiais originais fornecidos não são incluídos no commit público.
