# Logs técnicos, auditoria e métricas

São conceitos separados:

1. **Log técnico:** o bridge nativo usa `spdlog` no diretório de log do SKSE; o client adapter usa `printConsole`; o servidor emite linhas `console.info` allowlisted; o frontend tem diagnóstico opt-in via `?debug`. Esta rodada ainda não fornece um logger JSON unificado, rotação, timers de duração ou captura central de exceções.
2. **Auditoria:** decisão e mutação persistente no handler autoritativo que executa o domínio. Nenhum handler de mutação de domínio faz parte desta entrega.
3. **Métrica:** nenhum contador dedicado do Aetherius UI foi conectado. O servidor possui métricas gerais SkyMP, mas não se deve tratá-las como métricas deste Core.

As linhas atuais do client/server/native registram apenas eventos de sessão/transporte e, quando disponível, `moduleId`, ação e `correlationId`; não registram payload livre, sessão, inventário, credenciais ou identificadores pessoais. A distribuição/rotação dos logs e os hooks de auditoria permanecem decisões de integração do runtime Aetherius.
