# Origem do menu de criação

Snapshot de [Aetherius_Criacao_Personagem](https://github.com/NaoTemJuju/Aetherius_Criacao_Personagem) em `b7b8584a84b113ac4f7b1799d4d944648ba7ff50`. manifest.json preserva os hashes dos dez arquivos; upstream contém os bytes originais, sem .git ou binários.

As versões adaptadas executáveis ficam no native/src e frontend do Core. Não compile nem instale o main.cpp/CMake do snapshot junto ao bridge integrado: ambos usam AetheriusUIBridge.dll.

A [documentação da integração](../../docs/CHARACTER_CREATION.md) explica o registro no servidor, compilação, limites de autoridade e trabalho restante. O snapshot documenta a implementação local original; seus comandos de alteração de raça/nome não representam a política multiplayer aplicada pelo Core.
