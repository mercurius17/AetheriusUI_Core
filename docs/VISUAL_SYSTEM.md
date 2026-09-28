# Sistema visual

## Tokens

- Accent: `#4FC787`.
- Texto: `#F3F6F3`; secundário: `#A9B3AC`; indisponível: `#68736C`.
- Superfície de fundo: `#020504`; shade radial `0.50`; Workspace `0.76`.
- Tipografia local: `frontend/Data/MeridianUI/aetheriusui/fonts/futura-book-bt.ttf`, cópia byte a byte do arquivo fornecido nesta tarefa e usada em `@font-face`.
- Escala base de espaçamento: 4 px.

O shell usa superfícies planas, linhas finas e ícones vetoriais monocromáticos. O blur do mundo não é simulado com `backdrop-filter`; o fallback é o overlay escuro. A rotação radial usa onze ângulos derivados de `2π/N`; o centro mede 1.15× o diâmetro externo. A abertura/volta usa Web Animations API para mover o elemento selecionado até o cabeçalho e respeita `prefers-reduced-motion`.

## Assets

`frontend/Data/MeridianUI/aetheriusui/icons/` contém SVGs criados para o Core. A fonte foi fornecida pelo proprietário; nenhuma imagem dos PDFs, SkyUI, Untarnished UI ou Alduinak foi extraída ou incorporada. Ver `HUD_ASSETS.md` para a lista e procedência.
