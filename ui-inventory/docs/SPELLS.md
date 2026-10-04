# Menu de feitiços — 0.3.0

Implementado dentro de `ui-inventory`. O Core original não é alterado: seu slot 2 FEITIÇOS recebe o módulo `spells`, rota `/spells`, no pacote e na prévia. `register-inventory.cjs` registra os dois módulos sobre uma única instância do serviço e desfaz registros em caso de falha. A cópia do shell encerra o módulo anterior antes de trocar entre inventário, feitiços e favoritos.

## Categorias da referência

| Referência | Interface | Conteúdo |
|---|---|---|
| All | TODOS | Magias, poderes e gritos conhecidos; efeitos ativos ficam na aba própria. |
| Alteration | ALTERAÇÃO | Magias conhecidas de alteração. |
| Conjuration | CONJURAÇÃO | Invocações, reanimações e armas vinculadas da escola. |
| Destruction | DESTRUIÇÃO | Magias conhecidas de destruição. |
| Illusion | ILUSÃO | Magias conhecidas de ilusão. |
| Restoration | RESTAURAÇÃO | Magias conhecidas de restauração. |
| Powers | PODERES | Poderes conhecidos, maiores e menores, raciais, de quests ou especiais. |
| Shouts | GRITOS | Gritos conhecidos, mostrando apenas palavras desbloqueadas. |
| Active Effects | EFEITOS ATIVOS | Efeitos atuais, força, descrição e tempo restante ou duração permanente. |

O mesmo renderer do inventário mantém painéis, fonte, transparência, escala de conteúdo 80%, seleção/equipamento verde `#69CF99` em negrito e scroll com inércia. Novos glifos SVG de traço original identificam escolas, gritos e efeitos. A área direita usa o glifo da escola em vez de um modelo 3D de objeto. Busca, filtros de favoritos/equipados e ordenação são compartilhados. Custo, nível e recarga vêm do catálogo confiável; o host deve fornecer valores efetivos do personagem quando houver modificadores. Ausência de um valor aparece como `—`.

## Controles e favoritos

- Clique esquerdo: equipa na mão direita; repetir no mesmo slot desequipa.
- Clique direito: equipa na mão esquerda; repetir no mesmo slot desequipa.
- O indicador ao lado do feitiço mostra L, R ou L R conforme as mãos equipadas, tanto em FEITIÇOS quanto em FAVORITOS. Desequipar uma mão preserva o indicador da outra. Poderes e gritos mantêm seu indicador de slot próprio.
- E: equipa; F: adiciona/remove dos favoritos.
- Poderes e gritos compartilham o slot de voz/poder. Magias `twoHanded: true` ocupam e liberam ambas as mãos.
- Q ou botão Q FAVORITOS: abre `/inventory/favorites`. O rodapé também permite voltar ao inventário.
- No menu compacto, passar o mouse sobre o favorito e pressionar 1–9 associa o atalho. A ativação usa a mesma autoridade de equipamento do inventário.
- Efeitos ativos não têm ações de equipamento, favoritos, hotkeys, destruição ou recarga. R e T não executam ações no menu de feitiços.

Favoritos e hotkeys não são copiados para um segundo banco: `favoriteAbilities`, `hotkeys` e `equippedAbilities` são os mesmos campos canônicos. Desfavoritar ou esquecer uma habilidade remove seus atalhos. Equipar uma magia desloca equipamento incompatível da mão; substituir uma magia de duas mãos limpa as duas mãos.

## Contrato do servidor

Rotas `spells`: `snapshot`, `itemDetails`, `operationStatus`, `equipAbility`, `unequipAbility`, `setAbilityFavorite`. Nenhuma rota de concessão, aprendizado, importação, destruição ou alteração de efeitos é exposta ao CEF. O ator autenticado determina o personagem. Ownership, capability, revisão, idempotência, transação e outbox são compartilhados com o inventário. Equipamento exige `abilityEquip` e `projection`; gritos sem palavras desbloqueadas são recusados. `runtime.canEquipAbility`, quando fornecido pelo host, deve decidir compatibilidade com raça/classe/regras ativas.

`snapshot` pagina em até 40 linhas e 11.500 bytes. `expectedRevision` impede mistura de revisões. `asOf`, gerado na primeira página, preserva o conjunto de efeitos entre páginas por até cinco minutos; o renderer e os detalhes excluem efeitos expirados pelo relógio atual. Um catálogo incompleto retorna erro explícito, sem inventar habilidades ou ownership.

O catálogo passado a `createInventory({ abilities, ... })` aceita:

```js
{ key: 'Plugin.esm:012345', name: 'Nome da habilidade', kind: 'spell',
  school: 'restoration', magickaCost: 12, level: 0,
  twoHanded: false, description: 'Descrição verificada', effects: [] }
// kind: spell | power | shout
// school: alteration | conjuration | destruction | illusion | restoration
// powerType: greater | lesser; shout: words [até 3], cooldown em segundos
```

Identidades acima são exemplos de contrato, não registros reais de uma load order. Catálogos antigos sem escola ainda aparecem em TODOS e favoritos; o host deve preencher a escola para a organização específica.

Estado canônico adicional: `knownPowers`, `knownShouts`, `shoutWords` (chave do grito → 0–3), `activeEffects` (id, name, description, magnitude, expiresAt em UTC ms ou null). Continua no JSON transacional existente; nenhuma migração estrutural é necessária.

Para alimentar conhecimento, palavras desbloqueadas e efeitos, o host tem a API interna `trustedMagic(service, { allowedSources })`, exportada por `server/index.cjs`. `sync` recebe characterId, operationId, source, expectedRevision e os campos presentes a substituir. Ela valida catálogo/tipos, trava revisão, registra resultado idempotente e limpa favoritos/hotkeys/equipamento inválidos atomicamente. Remoção de equipamento usa outbox durável. Não registrar essa API como request do browser; o host deve chamar a partir de eventos autenticados do jogo/servidor. Sincronizar conhecimento não concede efeitos nativos automaticamente: novas magias devem ser aprendidas pelo fluxo autorizado do host.

## Validação e limites

61 testes do módulo e 14 do Core aprovados na rodada 04/10/2026, incluindo protocolo real entre os dois módulos, filtros, ownership, hotkeys, gritos, palavras bloqueadas, efeitos, API interna, duas mãos e ciclo de troca de menus. A UI é exercitada com DOM mínimo; não comprova renderização CSS no CEF.

Prévia direta: `http://127.0.0.1:4177/?menu=spells`, com dados sintéticos e efeitos de demonstração. O fornecimento do catálogo real, alimentação de efeitos/conhecimento pelo host e aplicação nativa no Skyrim ainda precisam de integração. Não há DLL/sink nativo de Q/números implementado. Os gates de produção anteriores continuam válidos.
