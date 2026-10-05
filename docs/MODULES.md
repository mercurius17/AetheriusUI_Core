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

O destino PERSONAGEM agora possui adapter de catálogo de raças em consulta, registrado pelo manifesto local. O servidor precisa instalar character-creation/register-character.cjs e publicar disponibilidade; nenhum botão habilita criação autoritativa por instalação local. A vista nativa chargen acompanha um RaceSexMenu já aberto e aceita apenas apresentação/câmera. Consulte [CHARACTER_CREATION.md](CHARACTER_CREATION.md).

`frontend/test-fixtures/` registra três módulos externos removíveis: uma fixture `class` de eco que exercita request/response, uma fixture `shop` com painel em branco e uma fixture `server` com estado vazio para prévia visual. Elas exercitam slots, mount/unmount e navegação. A fixture `shop` não apresenta serviço, preço, catálogo, pagamento, apoiador ou estado persistente. A fixture `server` não fornece dados de conexão. Elas não são módulos finais e só entram no pacote de desenvolvimento quando explicitamente habilitadas.

## Processo de integração

Destinos visuais nativos podem registrar `activate(context)` no adapter do navegador. O shell chama esse hook no radial, sem montar workspace, e fornece `signal`, `request` e `toast`. MAPA usa `AetheriusNativePresentation.openMap(signal)`: o bridge confirma a transição, libera Meridian e enfileira `MapMenu` diretamente; sucesso só é confirmado no evento nativo de abertura. Depois do commit, fechar o radial faz parte da transição e não a cancela. Ações sem commit são canceladas no abort. Nenhuma ação visual concede autoridade de gameplay.

`AetheriusInventoryPreview` implementa show/hide/clear/rect/camera com RenderLayer/1 e NifView/1 do Meridian. O token vem de itemDetails do ator autenticado. O bridge só aceita tokens recebidos nessa resposta; resolve o modelo do registro local vencedor, sem receber caminhos de arquivos do navegador. Armaduras usam o modelo de chão/inventário, com fallback de sexo; os demais itens usam TESModel. Status Ready é consultado no renderer. Rotação/zoom e retângulo são limitados; fechar ou trocar menus limpa a superfície. Modelos sem dados ou sem suporte permanecem indisponíveis.

Um pacote de domínio deve registrar seu adapter no ponto de bootstrap do servidor, negociar a versão do SDK, registrar só suas próprias ações permitidas e remover handlers/recursos no unload. `AetheriusUI.components` fornece factories sem dependências para botões, tabs, painéis, listas, linhas, busca, badges, progresso, stats, dicas de tecla, estado vazio, skeletons, modal, confirmação e toast. O shell também fornece estados de loading/empty/unavailable/error; o módulo externo fornece dados e páginas. O servidor valida cada comando e deriva jogador do `userId` autenticado.
