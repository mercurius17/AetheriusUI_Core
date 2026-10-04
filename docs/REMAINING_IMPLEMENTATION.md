# Implementação restante

Base: [estado atual](CURRENT_STATE.md), 04/10/2026. As prioridades abaixo indicam dependências técnicas; não autorizam habilitar capacidades client-side ou simular providers ausentes.

## 1. Fechar a validação visual atual

- Confirmar no jogo capacete, armaduras, armas e moeda opacos, sem partes vazadas, com rotação/zoom e troca rápida de seleção.
- Confirmar materiais com transparência real e alpha test, múltiplas peças, redimensionamento e fechamento/reabertura sem modelo residual. A geometria sintética dos testes não cobre todos os NIFs da load order.
- Confirmar MAPA → TAB fecha somente o mapa, inclusive tecla mantida/repetida, ESC, controle e transições de foco; um novo pressionamento após fechar deve abrir o radial normalmente.
- Auditar warnings DDS/material restantes e suporte de formatos relevantes, com fallback explícito. Não declarar compatibilidade universal com todos os mods a partir dos fixtures atuais.

## 2. Integrar autoridade transacional de gameplay

- Definir o adapter nativo durável de inventário/equipamento/feitiços, com ator autenticado, revision checks, idempotência e validação das regras no servidor.
- Fechar todos os escritores legados antes de habilitar equipar/consumir/destruir/aprender/favoritar/hotkeys. Demonstrar exclusão ou reconciliação de caminhos de escrita concorrentes.
- Garantir persistência e rollback/recuperação sob falha, desconexão, replay e reinício; atualizar cliente apenas com resposta/estado confirmado do servidor.
- Integrar CombatProfile e reconciliação de grants do GameplayCore antes de escolher classe, alocar/resetar atributos ou aplicar perks. Preservar grants de outras fontes.
- Implementar transações de grupo/raid, identidade, permissões, convites/remoções e persistência antes de liberar essas ações.

Aceite: testes de duas sessões/atores, comandos falsificados, ator/item alheios, revisão obsoleta, duplicação e queda entre escrita/resposta; nenhuma chamada client-side decide recompensa, progressão ou estado de domínio.

## 3. Completar providers e módulos

- Conectar ActorState/combate, efeitos ativos, custos dinâmicos, carga máxima e necessidades aos owners reais.
- Manter um único escritor de leveling; resolver integração com o módulo separado sem inicialização duplicada.
- Integrar Damage/Durability e os demais destinos do radial por contratos e providers próprios. Slots/fixtures não comprovam implementação de comércio, propriedades, profissões, sobrenatural ou servidor.
- Definir favoritos/hotkeys compartilhados entre inventário/feitiços e gameplay, com exclusividade de Q/1–9 e dispatch autorizado no servidor.

## 4. Resolver regressões e persistência de produção

- Corrigir as seis falhas atuais do ClassSystem após alinhar fixtures/contratos às regras autoritativas e resolução real de perks; manter as regressões de persistência aprovadas.
- Decidir o backend durável de produção e completar schema/migração/backup/recuperação. A leitura nativa e armazenamento local de testes não comprovam MySQL/PostgreSQL nem migração entre versões.
- Validar scripts Papyrus/plugins da load order que hoje estão preparados mas não executados automaticamente no host. Evitar habilitação ampla sem auditoria.
- Executar multiplayer em jogo com pelo menos dois clientes, reconexão, reinício de servidor e isolamento de estado por personagem.

## 5. Reproduzir e liberar o build

- Substituir dependência de cache/caminhos locais por bootstrap documentado e CI com versões fixadas de MSVC, CommonLib, CEF e vcpkg.
- Validar aplicação dos snapshots em checkout limpo, compilar e empacotar sem depender da instalação MO2 de desenvolvimento.
- Testar SE/AE adicionais e VR somente se entrarem no escopo; o resultado atual é AE 1.6.1170 Windows x64.
- Definir distribuição de binários/símbolos, licenças de assets/fontes, migração de configurações, instalação e rollback.

Aceite de produção: confirmação visual concluída, capabilities habilitadas apenas quando os adapters reais estiverem presentes, suíte relevante aprovada, build reproduzível e testes multiplayer/persistência concluídos.
