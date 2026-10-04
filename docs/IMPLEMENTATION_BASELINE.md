# Baseline de implementação

Este documento registra a coleta inicial. O estado após compilação, implantação e testes no jogo está em VALIDATION_REPORT.md; descrições de gaps abaixo não são o estado atual de instalação.

Coleta: 04/10/2026. UI Core `065c7468b4e439289d55f9c4c03b8b0b8e293778`; GameplayCore `fce674f5fc15e0cea7fa7ce886909bcb31de9ab5`; servidor `a89b2e665bb5821ecd645bc6f3b66213e65f54ef`; cliente `8d1dd4e97e1f26f80b360af8e0a0cc5ff14e3523`; headers Meridian `5707877322c85a1bd1c2e3309487f266d0647ca9`.

MO2: `C:/modOrganizer`, perfil AETHERIUS - GRAFICO - QUALIDADE; 550 mods habilitados, 424 plugins resolvidos (413 checked + 11 implícitos). Skyrim 1.6.1170.0; Node 22.14.0; VS 2022/MSVC 14.44 e Windows SDK 10.0.26100.0. Metadados de DLL não comprovam carga.

houseCARL identifica MeridianUIPlugin.dll no mod Meridian UI - GPU Rendered User Interface for Skyrim - DLSS 5 Support e SkyrimPlatform.dll 2.9.0 no mod AETHERIUS - MERIDIAN - COMPATIBILIDADE. Esse mod também vence para Platform/Plugins/skymp5-client.js. O bridge Core não está instalado. A descoberta de BSAs vanilla ficou incompleta por falta de Skyrim.ini no perfil/game; essa advertência não deve ser ocultada.

Os forks novos estão limpos e não contêm a integração Core dos patches históricos. O BrowserService atual já arbitra atalhos DOM do Meridian; suas correções devem ser preservadas. O GameplayCore contém baselines migradas e ActorState scaffold. Nenhum provider de combate/inventário durável será inventado para habilitar apresentação.
