# Protocolo Aetherius UI — versão 1

## Envelope

Toda mensagem da UI é JSON UTF-8 e usa um dos tipos `request`, `response`, `event`, `snapshot`, `patch` ou `error`.

```ts
interface UiEnvelope {
  protocolVersion: 1;
  kind: "request" | "response" | "event" | "snapshot" | "patch" | "error";
  messageId: string;
  correlationId: string;
  sessionId?: string;
  moduleId: string;
  action?: string;
  revision?: number;
  baseRevision?: number;
  payload?: unknown;
  error?: { code: string; message: string };
}
```

`sessionId` é emitido pelo servidor em `spawnAllowed`, depois que existe ator associado ao `userId` conectado, e vinculado a esse `userId`. O cliente nunca escolhe uma identidade. `messageId` é deduplicado por sessão; `correlationId` atravessa frontend, bridge, client adapter e router. Timeout não gera repetição automática de uma mutação.

## Limites e validação

- Tamanho máximo do envelope serializado: 16 KiB.
- `messageId`, `correlationId`, `sessionId`, `moduleId` e `action` têm limites de comprimento e formato validados antes do dispatch.
- Chaves de objeto `__proto__`, `prototype` e `constructor` são recusadas.
- O servidor verifica protocolo, sessão associada ao usuário conectado, schema, allowlist de ações registradas e dedupe. O frontend aplica timeout local de 8 s; o servidor não interrompe um handler que exceda esse prazo.
- `request` só é encaminhado a handler registrado. O fallback de demonstração é somente `core.echo`; não existe handler genérico de mutação.
- Snapshot substitui o estado daquele escopo. Patch só é aceito quando `revision > baseRevision` e `baseRevision` coincide com a revisão conhecida; lacuna invalida o estado e exige snapshot novo.
- Campos desconhecidos do envelope são rejeitados; o payload específico continua sendo validado pelo módulo servidor responsável.

## Erros estáveis

Erros remotos nesta versão: `INVALID_ENVELOPE`, `UNSUPPORTED_PROTOCOL`, `SESSION_MISMATCH`, `ACTION_UNAVAILABLE`, `FORBIDDEN`, `REQUEST_FAILED`, `RATE_LIMITED` e `PAYLOAD_TOO_LARGE`. Timeout e falha de ressincronização são diagnósticos locais do frontend; o router não envia `DUPLICATE_MESSAGE` para replay, pois reapresenta a resposta deduplicada.
