# Sistema visual

## Tokens

- Accent: `#4FC787`.
- Texto: `#F4EFE7`; secundário: `#B8AC99`; discreto: `#837C72`.
- Radial: fundo geral transparente, círculos pretos translúcidos sem borda; nomes verdes `#69CF99` em peso regular e ícones cinza. O módulo de exemplo Servidor usa painel preto translúcido; os demais módulos conservam fundo preto sólido.
- Referência do launcher: verde profundo `#1D3E2D`, linhas `#2A5A40` e títulos creme `#FFFAF0`.
- Tipografia local: `frontend/Data/MeridianUI/aetheriusui/fonts/futura-book-bt.ttf`, cópia byte a byte do arquivo fornecido nesta tarefa e usada em `@font-face`.
- Escala base de espaçamento: 4 px.

O shell usa superfícies planas, linhas finas e ícones vetoriais monocromáticos. `launcher-theme.css` aplica a marca serifada e a paleta inspirada no launcher. A tipografia geral permanece Futura. O fundo geral do radial não tem overlay; os círculos têm preenchimento preto translúcido e sem bordas. O texto de status não aparece nos círculos; a disponibilidade continua nas descrições acessíveis. `icons/nav-icons.svg` contém as silhuetas cinza ampliadas dos menus. No Live Server local, a captura do jogo é mostrada automaticamente atrás do anel com `filter: blur(5px)`; ela não aparece na interface carregada pelo jogo. O painel do exemplo Servidor deixa a imagem visível sob uma camada preta translúcida, sem linhas de contorno externas ou internas. A rotação radial usa onze ângulos derivados de `2π/N`; as posições e o raio são calculados dentro da área útil do radial, com margem para os círculos e a legenda inferior. Na abertura, uma máscara elíptica cresce a partir do círculo escolhido em etapas alternadas de expansão horizontal e vertical por 940 ms. O retorno contrai a máscara em 460 ms e reintroduz o radial em 380 ms. O jogo respeita `prefers-reduced-motion`, enquanto a prévia local exibe o movimento completo solicitado.

## Assets

`frontend/Data/MeridianUI/aetheriusui/icons/` contém SVGs criados para o Core. `brand/server-logo.png` é a logo fornecida pelo usuário e presente no repositório do launcher; o cabeçalho mostra o emblema por recorte CSS. `preview/ScreenShot112.png` é a captura de jogo fornecida pelo usuário para a demonstração. A fonte foi fornecida pelo proprietário; nenhuma imagem dos PDFs, SkyUI, Untarnished UI ou Alduinak foi extraída ou incorporada. Ver `HUD_ASSETS.md` para a lista e procedência.
