# Criação de personagem vanilla no Meridian

`chargen.html` é a única vista Meridian registrada por este plugin. Ela abre quando o Skyrim abre `RaceSex Menu` e fecha no mesmo evento. O menu circular, o HUD e os módulos do repositório de referência não são registrados nem distribuídos. O plugin oculta apenas a arte do SWF vanilla; o menu e seus callbacks continuam ativos, assim como a renderização do personagem pelo jogo. A vista não usa RaceMenu nem salva visuais.

A ponte lê as listas de raças, categorias e sliders do próprio SWF vanilla (`RaceSexPanelsInstance`). O HTML usa os limites e os valores presentes nessas listas. O índice da raça e o callback do slider são validados contra a lista ativa antes de serem enviados ao `FxDelegate`. Digitar o nome altera somente a vista; `RaceSexMenu::ChangeName` é chamado apenas depois de **Finalizar personagem → Confirmar finalização**. O destaque da raça acompanha a seleção enviada ao jogo e é reiniciado a cada nova abertura. Os botões Sortear categoria e Sortear aparência ignoram o slider de preset, cuja alteração abre a confirmação vanilla. Cada sorteio fica ao lado da restauração correspondente. A lista de sliders rola dentro do painel; o título da categoria e os quatro botões de ação continuam visíveis, e um aviso discreto indica ajustes adicionais abaixo. Outras caixas nativas liberam o foco enquanto estiverem abertas. A descrição traduzida é aplicada às dez raças vanilla; raças adicionais mantêm a descrição fornecida pelo jogo.

O palco central é transparente para mostrar o personagem real. Arrastar na horizontal acumula uma órbita de câmera; arrastar na vertical desloca a altura; a roda altera a distância. O limite de aproximação foi reduzido em aproximadamente dois passos de scroll para evitar que a câmera entre no modelo. O deslocamento máximo para cima é de 15 unidades; o limite para baixo e a sensibilidade continuam iguais. Esses valores são aplicados ao nó de `RaceSexCamera` no hook de atualização, preservando a transformação produzida pelo jogo a cada quadro. A direção vertical segue a prévia aprovada pelo usuário. Um ajuste lateral posiciona o modelo mais perto do centro do palco, sem deslocar os painéis. A vista recebe entrada de cursor por `Meridian.Input/1` e foco pausado por `Meridian.View/1`. Quando `showracemenu` é iniciado pelo console, a ponte envia o comando nativo para fechá-lo.

## Compilação

Requer Visual Studio 2022, CMake, vcpkg, CommonLibSSE-NG e os cabeçalhos públicos MeridianUIAPI. Configure `COMMONLIB_PATH` para o checkout do CommonLib e `MERIDIAN_INCLUDE_DIR` para a pasta que contém `MeridianUIAPI`. Compile `AetheriusUIBridge` com `ENABLE_SKYRIM_SE=ON`, `ENABLE_SKYRIM_AE=ON` e `ENABLE_SKYRIM_VR=OFF`. O pacote de distribuição junta `Data/SKSE/Plugins/AetheriusUIBridge.dll` aos arquivos `Data/MeridianUI/aetheriusui`.

## Verificação no jogo pendente

1. Abrir um jogo novo com Skyrim SE/AE, SKSE e Meridian UI instalados e sem RaceMenu.
2. Conferir se a interface Meridian substitui a arte vanilla enquanto o personagem continua visível.
3. Trocar raça e sexo; confirmar que o modelo e os sliders do jogo acompanham as alterações.
4. Testar sliders numéricos, restauração e sorteio por categoria e gerais, rotação horizontal, altura vertical e limite do zoom.
5. Digitar um nome e confirmar que o menu permanece aberto; clicar em Finalizar personagem e confirmar que a única caixa Meridian pede a confirmação. Confirmar e verificar que o nome é aplicado sem uma segunda entrada e que o menu fecha.
6. Reabrir o menu com `showracemenu`, confirmar que o console fecha e que nenhuma caixa fica sem clique.
7. Conferir centralização do personagem em enquadramento de rosto e corpo inteiro, inclusive depois de zoom, giro e movimento vertical.

Essa verificação é necessária porque uma compilação bem-sucedida não confirma o comportamento de Scaleform, foco e câmera em execução.
