# Aetherius — Criação de Personagem Vanilla

Interface de criação de personagem para o **RaceSexMenu vanilla** do Skyrim SE/AE, exibida pelo Meridian UI. Este repositório contém somente o módulo de criação: não inclui o menu circular, HUD, tela de servidor nem RaceMenu.

O código SKSE roda no **cliente** do Skyrim. Nenhum componente deste repositório precisa ser instalado no servidor. A interface lê raças, categorias e sliders do menu vanilla; o nome só é aplicado ao confirmar a finalização. A câmera aceita arrasto para girar e ajustar a altura, além de scroll para zoom. O painel de aparência mantém os botões de restaurar e sortear visíveis enquanto listas longas de sliders rolam.

## Arquivos

- `native/`: plugin SKSE que conecta o RaceSexMenu à vista Meridian e controla a câmera.
- `frontend/Data/MeridianUI/aetheriusui/chargen.*`: interface, estilos, lógica e ícones desenhados à mão.
- `docs/CHARACTER_CREATION.md`: integração, compilação e roteiro de teste no jogo.

## Compilação

Requer Visual Studio 2022, CMake, vcpkg, CommonLibSSE-NG (alandtse/ng) e os cabeçalhos públicos MeridianUIAPI. Aponte `COMMONLIB_PATH` para o checkout do CommonLib e `MERIDIAN_INCLUDE_DIR` para o diretório que contém `MeridianUIAPI`. Compile `native/` para SE+AE com VR desativado. O alvo `AetheriusUIBridge` copia os quatro arquivos da vista para `dist/Release/Data/MeridianUI/aetheriusui` e gera a DLL em `dist/Release/Data/SKSE/Plugins`.

Para instalar, una o conteúdo de `dist/Release/Data` ao mod cliente no Mod Organizer 2. São necessários Skyrim SE/AE, SKSE, Address Library e Meridian UI. Não instale versões antigas deste módulo em paralelo.

A compilação Release foi verificada; o comportamento no jogo ainda depende de teste em jogo novo e `showracemenu`. Veja o roteiro em `docs/CHARACTER_CREATION.md`.
