# ADR 0001: reutilizar CustomPacket do SkyMP

- Status: aceito para a primeira integração.
- Contexto: o client atual envia `CustomPacket` pelo `mpClientPlugin`; o servidor despacha `customPacket` com `userId` autenticado. Uma conexão externa paralela contrariaria o desenho atual.
- Decisão: o Core usa `MsgType.CustomPacket`/`ScampServer.sendCustomPacket`, com envelope versionado e sessão emitida em `spawnAllowed`, depois que o servidor associa o ator ao `userId` conectado. O payload browser ↔ client cruza o bridge como `ModCallbackEvent` local do Skyrim Platform.
- Consequências: compatível com a infraestrutura observada; sessões, limites, dedupe e schema são implementados no Core. A integração precisa ser exercitada com client e servidor reais.
