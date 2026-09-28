# Sistema visual

## Tokens

- Accent: `#4FC787`.
- Texto: `#F4EFE7`; secundário: `#B8AC99`; discreto: `#837C72`.
- Radial: fundo geral transparente, círculos pretos em degradê; nomes brancos e ícones cinza. Módulos: fundo preto sólido `#000000`.
- Referência do launcher: verde profundo `#1D3E2D`, linhas `#2A5A40` e títulos creme `#FFFAF0`.
- Tipografia local: `frontend/Data/MeridianUI/aetheriusui/fonts/futura-book-bt.ttf`, cópia byte a byte do arquivo fornecido nesta tarefa e usada em `@font-face`.
- Escala base de espaçamento: 4 px.

O shell usa superfícies planas, linhas finas e ícones vetoriais monocromáticos. `launcher-theme.css` aplica a marca serifada e a paleta inspirada no launcher. A tipografia geral permanece Futura. O fundo geral do radial não tem overlay; os círculos têm preenchimento preto que perde opacidade nas bordas. O texto de status não aparece nos círculos; a disponibilidade continua nas descrições acessíveis. `icons/nav-icons.svg` contém as silhuetas cinza ampliadas dos menus. Com `?preview`, a captura do jogo é mostrada atrás do anel com `filter: blur(5px)`; ela não aparece no jogo. Ao abrir um módulo, o shell muda para uma superfície preta sólida. A rotação radial usa onze ângulos derivados de `2π/N`; as posições e o raio são calculados dentro da área útil do radial, com margem para os círculos e a legenda inferior. A abertura/volta usa Web Animations API para mover o elemento selecionado até o cabeçalho e respeita `prefers-reduced-motion`.

## Assets

`frontend/Data/MeridianUI/aetheriusui/icons/` contém SVGs criados para o Core. `preview/ScreenShot112.png` é a captura de jogo fornecida pelo usuário para a demonstração. A fonte foi fornecida pelo proprietário; nenhuma imagem dos PDFs, SkyUI, Untarnished UI ou Alduinak foi extraída ou incorporada. Ver `HUD_ASSETS.md` para a lista e procedência.
