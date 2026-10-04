# Integração com GameplayCore

Fonte: `mercurius17/AetheriusGameplayCore@fce674f5fc15e0cea7fa7ce886909bcb31de9ab5`, checkout `C:/Code/Aetherius - SkyMP/referencias/AetheriusGameplayCore`. Foi eleita a implementação em `modules/class-system`; não foi inicializado o módulo Leveling separado como segundo escritor.

O servidor carrega `integrations/register-class.cjs` por caminho absoluto configurado pelo host. As funções get/set/makeProperty/getServerSettings são ligadas ao addon nativo real. Os handlers class/party são registrados somente após bootstrap; unload cancela handlers/sessões, e respostas assíncronas verificam novamente sessão e ator. Frontend recebe projeções JSON do domínio e não pode escolher o ator autenticado.

Class e Party estão em modo de consulta. O host pinado não exporta CombatProfile/reconciliação de grants; Party não oferece a transação autoritativa requerida para habilitar mutações. Não foram substituídas essas dependências por funções fictícias. A UI informa o motivo e desabilita ações de seleção, alocação, reset e alteração de grupo. As leituras e a persistência inicial pertencem ao owner existente.

O repository de classe agora falha sem criar defaults ao ocorrer erro de leitura/JSON/ownership/esquema; cache só é atualizado após persistência bem-sucedida. Não se apagam grants de outras fontes. Dados opcionais undefined são removidos na serialização dos DTOs. Valores artificiais de vida de membros de grupo não são projetados.

TrueHUD controla exclusivamente as barras de vida/magia/vigor; o Core não as desenha nem publica. Necessidades não são inventadas. ActorState continua scaffold e não é provider de combate. Damage/Durability não foram ativados sem capacidades reais do host.

Inventory/Spells são instalados e registrados com um provider de consulta: Inventory e knownSpells pertencem ao ator autenticado no servidor. O getter nativo reúne aprendizado, NPC-base e raça, sem setter. Adapter durável/fence de escritores continuam pendentes; mutações, equipamento e favoritos permanecem fechados. Mapa abre MapMenu diretamente no bridge, com liberação de foco e confirmação nativa, sem autoridade sobre gameplay. O preview 3D usa um token de itemDetails do servidor e renderer local Meridian; não depende de equipar/consumir nem altera registros ou inventário.

Core shared/sdk é a origem única vendorizada por script; cada consumidor recebe PROVENANCE.json com baseline e hashes. Os patches antigos não foram aplicados cegamente às novas baselines.

A suíte original do ClassSystem já falhava em seis testes antes das alterações (44/50). Após acrescentar cinco regressões de persistência, o resultado foi 49/55, com as mesmas seis falhas em quatro suites. Elas incluem expectativas antigas de relato client-side de XP/kill e catálogo/resolução de perks. A suite não está verde e os grants/mutações continuam fechados.
