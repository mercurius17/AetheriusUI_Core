# Manifesto de assets do shell e HUD

| Asset | Uso | Origem/licença |
|---|---|---|
| `icons.svg` | Ícones vetoriais originais de navegação e HUD: personagem, módulos, vida, magia, vigor, fome, sede, fadiga e alerta | SVG original escrito para este Core; sem dependência externa. |
| `brand/server-logo.png` | Emblema do cabeçalho do shell | Cópia de `referencias/repositories/aetherius-launcher/src/assets/icon-logo.png`, correspondente à logo enviada pelo usuário. |
| `fonts/futura-book-bt.ttf` | Tipografia local do shell/HUD | Cópia byte a byte de `referencias/futura-book-bt.ttf`, fornecida pelo proprietário do projeto. Metadados/licença de redistribuição não foram fornecidos. |

O HUD renderiza somente snapshots/eventos enviados pelo servidor através do client adapter. As barras e necessidades começam ocultas; nenhum valor decorativo ou de exemplo é mostrado em runtime. O `pointer-events` do HUD e da página ficam desativados. Até existir módulo servidor que forneça esses dados, o HUD permanece oculto.
