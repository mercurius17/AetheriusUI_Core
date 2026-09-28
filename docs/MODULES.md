# Registry e integração de módulos

## Catálogo de navegação

| Slot | ID | Label | Estado inicial |
|---:|---|---|---|
| centro | `character` | PERSONAGEM | externo / indisponível |
| 1 | `class` | CLASSE | externo / indisponível |
| 2 | `spells` | FEITIÇOS | externo / indisponível |
| 3 | `party` | GRUPO | externo / indisponível |
| 4 | `inventory` | INVENTÁRIO | externo / indisponível |
| 5 | `server` | SERVIDOR | externo / indisponível |
| 6 | `map` | MAPA | externo / indisponível |
| 7 | `professions` | PROFISSÕES | externo / indisponível |
| 8 | `supernatural` | SOBRENATURAL | externo / indisponível |
| 9 | `properties` | PROPRIEDADES | externo / indisponível |
| 10 | `house` | CASA | externo / indisponível |
| 11 | `shop` | LOJA | externo / indisponível |

Cada registro declara versão, janela do SDK, label, rota raiz e subrotas, slot, assets locais, capabilities/permissões, disponibilidade, mount/unmount e hooks de request/event. ID e slot são únicos; caminhos de rota e assets são limitados ao espaço local do módulo. O contexto de mount fornece `AbortSignal`, versão do SDK, capabilities declaradas, requests, eventos, navegação, toasts e componentes comuns. Inscrições criadas pelo contexto são removidas no unmount. Desregistro aborta mount em andamento e chama cleanup no máximo uma vez.

## Fixtures de demonstração

`frontend/test-fixtures/` registra dois módulos externos removíveis: uma fixture `class` de eco que exercita request/response e uma fixture `shop` com painel em branco. Elas exercitam slots, mount/unmount e navegação. A fixture `shop` não apresenta serviço, preço, catálogo, pagamento, apoiador ou estado persistente. Ela não é a Loja final e só entra no pacote de desenvolvimento quando explicitamente habilitada.

## Processo de integração

Um pacote de domínio deve registrar seu adapter no ponto de bootstrap do servidor, negociar a versão do SDK, registrar só suas próprias ações permitidas e remover handlers/recursos no unload. `AetheriusUI.components` fornece factories sem dependências para botões, tabs, painéis, listas, linhas, busca, badges, progresso, stats, dicas de tecla, estado vazio, skeletons, modal, confirmação e toast. O shell também fornece estados de loading/empty/unavailable/error; o módulo externo fornece dados e páginas. O servidor valida cada comando e deriva jogador do `userId` autenticado.
