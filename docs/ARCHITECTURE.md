# Arquitetura do Aetherius UI Core

## Fronteiras

```text
Módulos externos de domínio
  ↕ contrato versionado / registry
Aetherius UI SDK + router genérico
  ↕ `MsgType.CustomPacket` pelo SkyMP já utilizado
Client adapter no `aetherius-client`
  ↕ eventos `ModCallbackEvent` do Skyrim Platform
Bridge SKSE consumidor do Meridian
  ↕ conteúdo local `mod://aetheriusui/`
Meridian View/1 (Main View persistente + HUD passivo)
```

O shell e os SDKs vivem em `shared/`, `sdk/` e `frontend/`. A integração do cliente entra como um serviço no `aetherius-client/client/src`; o router do servidor entra como um `System` no `aetherius-server/server/ts`. Os dois usam as APIs e o transporte já existentes. A pasta `native/` contém somente o consumidor SKSE do Meridian, não uma cópia do runtime Meridian.

## Estado verificado e decisão de compatibilidade

O cliente atualmente desenha a UI no browser do Skyrim Platform e converte `cef::ui:event` em custom packets. O Meridian não aparece em manifests, no perfil de mods nem nos scripts de instalação observados. Assim, o Core adiciona um consumidor separado do Meridian e liga-o ao cliente por `ModCallbackEvent`; a integração continua dependente de instalar o Meridian como mod e o bridge como plugin SKSE.

O commit do Meridian usado para desenvolver esta rodada é o `main` observado em `5707877` (README: 1.5.0), mas isso não significa que Aetherius já o distribua. A versão de Skyrim/SKSE do runtime do proprietário continua desconhecida.

## Main View e HUD

- `AetheriusMainView` é uma página persistente. Radial, Workspace e camadas comuns mudam estado sem destruir o browser.
- `AetheriusHUDView` é um browser separado e sem foco. Seus widgets ficam ocultos enquanto nenhum snapshot real os fornece.
- O radial apresenta `character` no centro e onze descritores fixos. A geometria é derivada de `N`; as posições não dependem da disponibilidade dos módulos.
- Nenhum módulo final de domínio é incluído. Os exemplos em `frontend/test-fixtures/` são exclusivamente demonstrações de contrato; `shop` é um painel vazio sem regra comercial.

## Canal e autoridade

O shell registra os listeners `aetheriusUiSend` e `aetheriusUiSetFocus` pela API `Meridian.View/1`. O bridge encaminha texto JSON por `ModCallbackEvent` local do Skyrim Platform; o client adapter valida o protocolo e envia `CustomPacket` reliable ao servidor. O servidor emite a sessão em `spawnAllowed`, depois de haver ator associado ao `userId`, e valida envelope, tamanho, sessão e deduplicação antes de encaminhar a um handler registrado. Respostas retornam pelo mesmo transporte e são entregues às Views pelo bridge.

O envelope não contém um campo de identidade. Handlers recebem `userId` somente do contexto do servidor e obtêm ator autenticado com `ctx.svr.getUserActor(userId)`. O exemplo de eco não altera estado do jogo.

## Limites atuais

Meridian não expõe, nos contratos públicos verificados, uma configuração que simultaneamente capture mouse/ações de UI e deixe movimento WASD/corrida continuar. O protótipo usa `View/1` e `Input/1`, foco `Unpaused`, sink nativo para `TAB` e atalho `LeftShoulder + Start`; a combinação de movimento, rebinding, menu concorrente e recuperação de key-up permanece gate in-game. Não há prova de passthrough de WASD.
