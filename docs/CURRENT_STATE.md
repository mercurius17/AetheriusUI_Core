# Estado atual — 04/10/2026

Esta entrega é um runtime local de testes integrado, com consulta real ao servidor. Ainda não é uma implementação de produção com mutações autoritativas completas. O histórico detalhado está em [VALIDATION_REPORT.md](VALIDATION_REPORT.md); os próximos passos estão em [REMAINING_IMPLEMENTATION.md](REMAINING_IMPLEMENTATION.md).

## Implementado e integrado

- Shell persistente Meridian/CEF, radial TAB com ícones, animações e módulos carregados por manifesto.
- Bridge SKSE compilado com CommonLibSSE-NG; foco, captura de input e movimentação controlados por API pública do Meridian.
- Protocolo versionado com validação de tamanho/esquema, sessão autenticada, identidade do ator derivada do servidor, limites de filas, deduplicação concorrente e descarte de respostas de sessões antigas.
- CLASSE/GRUPO consomem projeções do GameplayCore. Falhas de persistência não criam defaults nem sobrescrevem cache com estado não persistido.
- INVENTÁRIO/FEITIÇOS consultam inventário e habilidades do ator autenticado no host nativo, incluindo dados base/raça/aprendizado. Campos opcionais ausentes são omitidos dos DTOs.
- MAPA abre diretamente o MapMenu nativo. O bridge libera foco e confirma o MenuOpenCloseEvent, sem página intermediária.
- Preview 3D resolve somente tokens de itens confirmados pelo servidor e carrega o modelo da load order local. Rotação/zoom/retângulo são apresentação local e não mutações do inventário.
- Renderer NIF usa contexto deferred do dispositivo do jogo quando texturas compartilhadas são indisponíveis. Materiais opacos ignoram alpha difuso; transparência real é composta em formato premultiplicado.
- TAB com MapMenu aberto solicita apenas seu fechamento e consome o pressionamento. Abertura do radial é bloqueada enquanto o mapa permanece aberto.
- Screenshot demonstrativa fica fora de Data. Barras de vida/magia/vigor pertencem ao TrueHUD e foram retiradas do Core.
- Menu de raças importado de Aetherius_Criacao_Personagem, com atribuição e snapshot verificável. PERSONAGEM apresenta catálogo vanilla em consulta após registro no servidor; a vista RaceSexMenu e sua câmera foram incorporadas à mesma DLL. Raça, sexo, aparência, nome e finalização permanecem bloqueados no Core até integração autoritativa. Veja [CHARACTER_CREATION.md](CHARACTER_CREATION.md).

## Verificação e limites

Ambiente observado: Windows x64, Skyrim AE 1.6.1170, SKSE 2.2.6, Skyrim Platform 2.9.0, CEF 152.0.6, MO2 `C:\modOrganizer`, perfil `AETHERIUS UI - TESTE LOCAL`, 551 mods habilitados e 424 plugins resolvidos. Perfil original preservado. Builds locais usam toolchains/dependências separados para bridge, Meridian e servidor; SE/VR não foram validados.

O usuário confirmou em jogo ícones/animações do radial, abertura de classes/grupos, consulta de itens/feitiços, mapa nativo e aparecimento de modelos 3D. A última rodada corrigiu opacidade/sobreposição do preview e fechamento por TAB; **essas duas correções ainda aguardam confirmação visual do usuário**. Carga das DLLs corrigidas foi confirmada no SKSE.

| Verificação | Resultado registrado |
|---|---|
| Core/protocolo/router/SDK | 18/18 após integração do catálogo de raças, incluindo sessão, comandos falsificados e unload. |
| UI, navegação, mapa e ciclo de preview | 23/23 na última rodada funcional. |
| Cliente Meridian | 28/28 na rodada de integração. |
| Bridge/input/criação | 2/2 CTest, incluindo a política de comandos de apresentação do menu de raças. |
| Renderer gráfico/composição/câmera/arquitetura | 5/5 CTest e renderer de produção na GPU física; transparência e occlusão com geometria sintética. |
| Host nativo com load order local | Leitura de itens/feitiços/tokens, rejeição de ator/item alheios e mutações; inventário preservado. |
| ClassSystem GameplayCore | Build TypeScript aprovado; 49/55 testes, seis falhas preexistentes, rechecados antes do commit. |

As seis falhas estão nas suítes classes, leveling, server e perkResolver: resolução de perks sem host, contagem 351 versus 350 e expectativas antigas de recompensa de abate. Não são ocultadas como suíte aprovada. O estado dos demais módulos do GameplayCore não foi validado por estes testes.

## Autoridade e distribuição

Class/Party/Inventory/Spells ficam em consulta no provider local. Selecionar classe, distribuir/resetar atributos, alterar grupo, equipar, consumir, destruir, aprender, favoritar e ativar hotkeys exigem integração transacional ainda ausente. Dados simulados de testes não habilitam essas capacidades. Necessidades, carga máxima, efeitos/custos dinâmicos e grants não são inventados quando falta provider.

As alterações de aetherius-server, aetherius-client e MeridianUI estão preservadas em [integrations/runtime-changes](../integrations/runtime-changes/README.md), com uma cópia no GameplayCore, patches completos, fontes, baselines e hashes. O SDK vendorizado mantém PROVENANCE. Os patches antigos têm outras baselines e são apenas históricos.

O pacote r5 foi compilado/instalado com hashes Data conferidos. ZIP local: `AetheriusUI-Core-local-20261004-r5.zip`, SHA-256 `4dc16c4d837e2654c49a3764508f35cd097e7dc1202f6dfee1a20e56ea8f3bea`. Binários, CEF, logs extensos, banco/saves e configuração de sessão permanecem no ambiente de testes, fora do código versionado. Compilar em outra máquina exige preparação descrita em [BUILD_AND_DEPLOY.md](BUILD_AND_DEPLOY.md).
