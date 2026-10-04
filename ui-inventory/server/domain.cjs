'use strict';
const crypto = require('node:crypto');
const { fail, integer, fingerprint, clone } = require('../shared/contract.cjs');
function item(state, id) { const i = state.items.find(row => row.id === id && row.count > 0); if (!i) fail('ITEM_NOT_OWNED', 'Item não pertence a este inventário.'); return i; }
function stackKey(row) { const { id, count, equipped, favorite, provenance, ...variant } = row; return fingerprint({ ...variant, favorite: !!favorite, equipped: equipped || [] }); }
function weight(state, catalog) { return state.items.reduce((n, row) => n + catalog.get(row.key).weight * row.count, 0); }
function invariant(state, catalog) {
  integer(state.characterId, 1); integer(state.revision, 0, Number.MAX_SAFE_INTEGER); integer(state.gold, 0);
  if (!Number.isFinite(state.carryWeight) || state.carryWeight < 0 || state.carryWeight > 1e6) fail('INVARIANT_VIOLATION', 'Capacidade inválida.');
  const ids = new Set(), slots = new Set();
  for (const [slot,key] of Object.entries(state.equippedAbilities||{})) {
    if (!['left','right','power'].includes(slot)) fail('INVARIANT_VIOLATION','Slot de magia inválido.');
    if (!key) continue;
    if (!(slot==='power'?[...(state.knownPowers||[]),...(state.knownShouts||[])]:state.knownSpells||[]).includes(key)) fail('INVARIANT_VIOLATION','Magia equipada não conhecida.');
    slots.add(slot);
  }
  for (const row of state.items) {
    if (ids.has(row.id)) fail('INVARIANT_VIOLATION', 'Instância duplicada.'); ids.add(row.id);
    integer(row.count, 1); catalog.get(row.key);
    if (row.equipped?.length && row.count !== 1 && catalog.get(row.key).equip?.kind !== 'ammo') fail('INVARIANT_VIOLATION', 'Equipamento deve ser individualizado.');
    for (const slot of row.equipped || []) { if (slots.has(slot)) fail('INVARIANT_VIOLATION', 'Slot ocupado duas vezes.'); slots.add(slot); }
    if (row.charge !== undefined && (!Number.isFinite(row.charge) || row.charge < 0 || row.charge > (row.maxCharge || 0))) fail('INVARIANT_VIOLATION', 'Carga inválida.');
  }
}
function reconciled(state) {
  if (state.items.some(row => row.provenance?.reviewRequired)) fail('NOT_RECONCILED', 'Inventário legado exige reconciliação antes de qualquer projeção.');
}
function remove(state, row, count) {
  integer(count, 1); if (row.count < count) fail('INSUFFICIENT_ITEMS', 'Quantidade insuficiente.');
  row.count -= count;
  if (!row.count) state.items = state.items.filter(i => i !== row);
}
function separate(state, row) {
  if (row.count === 1) return row;
  row.count -= 1;
  const single = { ...clone(row), id: crypto.randomUUID(), count: 1, provenance: { ...row.provenance, splitFrom: row.id } };
  state.items.push(single); return single;
}
function mergeStacks(state) {
  const groups=new Map(),redirects={};
  for(const row of state.items){
    if(row.equipped?.length)continue;
    const key=stackKey(row),existing=groups.get(key);
    if(!existing){groups.set(key,row);continue;}
    if(existing.count+row.count>2_147_483_647)continue;
    existing.count+=row.count;
    // Full lineage lives in the persistent ledger. Bound the live aggregate
    // so repeated split/merge operations cannot grow state without limit.
    existing.provenance={...(existing.provenance||{}),mergedTotal:(existing.provenance?.mergedTotal||0)+1,mergedFrom:[...(existing.provenance?.mergedFrom||[]),{id:row.id,count:row.count,source:row.provenance?.source||null,operationId:row.provenance?.operationId||null,splitFrom:row.provenance?.splitFrom||null}].slice(-128)};
    redirects[row.id]=existing.id;
  }
  state.items=state.items.filter(row=>!redirects[row.id]);return redirects;
}
function movement(state, row, delta, action, beforeCount, details = {}) {
  return { characterId: state.characterId, itemId: row.id, key: row.key, delta, beforeCount, afterCount: beforeCount + delta, action, details };
}
function execute(states, actor, cmd, catalog, policy) {
  for (const s of states.values()) reconciled(s);
  const state = states.get(actor.characterId);
  if (state.revision !== cmd.expectedRevision) fail('REVISION_CONFLICT', 'Inventário mudou. Sincronize novamente.');
  let row = cmd.itemId ? item(state, cmd.itemId) : null;
  const record = row ? catalog.get(row.key) : null;
  const events = [], effects = [], touched = new Set([state.characterId]);
  const emit = (r, count, action = cmd.action, details = {}) => { const before = r.count; events.push(movement(state, r, -count, action, before, details)); remove(state, r, count); };
  const effect = (type, data) => { if (!policy.supports(type)) fail('ACTION_UNAVAILABLE', 'O host não oferece aplicação durável para esta ação.'); effects.push({ type, characterId: actor.characterId, ...data }); };
  const mutable = () => { if (row.questItem || row.locked) fail('ITEM_LOCKED', 'Item de missão ou bloqueado.'); };
  const target = () => item(state, cmd.targetItemId);
  const equip = () => {
    if (!record.equip) fail('NOT_EQUIPPABLE', 'Item não equipável.');
    if (row.locked) fail('ITEM_LOCKED', 'Instância legada ainda não foi reconciliada.');
    if (policy.canEquip && !policy.canEquip(actor, row, record, state)) fail('EQUIPMENT_UNSUPPORTED', 'Equipamento incompatível com o pipeline ativo.');
    if (record.equip.kind !== 'ammo') row = separate(state, row);
    const hand = cmd.hand === 'auto' ? 'right' : cmd.hand;
    const kind = record.equip.kind;
    const slots = kind === 'twoHand' ? ['left', 'right'] : kind === 'shield' ? ['left'] : ['oneHand', 'staff', 'scroll'].includes(kind) ? [hand] : record.equip.slots;
    if (!slots.length) fail('NOT_EQUIPPABLE', 'Slots não configurados.');
    const affected = [];
    for (const slot of slots) if (state.equippedAbilities?.[slot]) {
      const previous=state.equippedAbilities[slot];
      if(policy.abilityCatalog?.get(previous).twoHanded)for(const hand of ['left','right'])state.equippedAbilities[hand]=null;
      else state.equippedAbilities[slot]=null;
    }
    for (const other of state.items) if (other !== row && (other.equipped || []).some(s => slots.includes(s))) { affected.push({ itemId: other.id, previous: other.equipped }); other.equipped = []; }
    const before = row.equipped || []; row.equipped = slots;
    events.push(movement(state, row, 0, cmd.action, row.count, { before, after: slots, displaced: affected, splitFrom: row.provenance?.splitFrom }));
  };
  switch (cmd.action) {
    case 'equip': equip(); break;
    case 'equipScroll': if (record.equip?.kind !== 'scroll') fail('INVALID_ITEM', 'Não é pergaminho.'); equip(); break;
    case 'unequip': {
      const before = row.equipped || [];
      if (!before.length) fail('NOT_EQUIPPED', 'Item não está equipado.');
      if (cmd.hand !== 'auto' && !before.includes(cmd.hand)) fail('NOT_EQUIPPED', 'Item não está equipado nesta mão.');
      row.equipped = []; events.push(movement(state, row, 0, cmd.action, row.count, { before, after: [] })); break;
    }
    case 'setFavorite': row.favorite = cmd.favorite; events.push(movement(state, row, 0, cmd.action, row.count, { favorite: cmd.favorite })); break;
    case 'consume': {
      mutable();
      if (!['potions', 'food', 'ingredients'].includes(record.category) || record.poison) fail('INVALID_ITEM', 'Item não pode ser consumido.');
      effect('consume', { itemKey: row.key, effects: clone(record.effects || []) });
      if (record.category === 'ingredients' && record.effects?.length) {
        const known = state.knownEffects[row.key] || [];
        state.knownEffects[row.key] = [...new Set([...known, record.effects[0].id])];
      }
      emit(row, 1); break;
    }
    case 'read': {
      if (record.category !== 'books' || record.spellKey) fail('INVALID_ITEM', 'Use a ação de aprender magia para tomos.');
      if (record.readEffect && !state.readBooks.includes(record.key)) { effect('readEffect', { itemKey: row.key, readEffect: record.readEffect }); state.readBooks.push(record.key); }
      events.push(movement(state, row, 0, cmd.action, row.count)); break;
    }
    case 'learnTome': {
      mutable(); if (!record.spellKey) fail('INVALID_ITEM', 'Não é tomo de magia.');
      if (state.knownSpells.includes(record.spellKey)) fail('SPELL_ALREADY_KNOWN', 'Você já conhece esta magia.');
      effect('learnSpell', { spellKey: record.spellKey }); state.knownSpells.push(record.spellKey); emit(row, 1); break;
    }
    case 'castScroll': {
      mutable(); if (record.equip?.kind !== 'scroll' || !row.equipped?.length) fail('INVALID_ITEM', 'Pergaminho não preparado.');
      if (!policy.interaction || policy.interaction.kind !== 'cast') fail('FORBIDDEN', 'Lançamento não autorizado.');
      effect('castScroll', { itemKey: row.key, cast: policy.interaction.effect }); emit(row, 1); break;
    }
    case 'applyPoison': {
      mutable(); const weapon = target(), w = catalog.get(weapon.key);
      if (!record.poison || !['oneHand', 'twoHand'].includes(w.equip?.kind) || !weapon.equipped?.length) fail('INVALID_ITEM', 'Veneno ou arma incompatível.');
      if (weapon.poison && weapon.poison.remaining > 0) fail('ALREADY_POISONED', 'Arma já envenenada.');
      weapon.poison = { key: row.key, remaining: integer(record.poisonUses ?? 1, 1, 100) };
      events.push(movement(state, weapon, 0, cmd.action, weapon.count, { poison: weapon.poison })); emit(row, 1); break;
    }
    case 'recharge': {
      mutable(); const weapon = target();
      const soul = row.soul ?? record.soul ?? 0;
      if (!record.soulGem || !soul || !weapon.enchantment || !weapon.maxCharge) fail('INVALID_ITEM', 'Soul Gem ou arma incompatível.');
      if (weapon.charge >= weapon.maxCharge) fail('ALREADY_CHARGED', 'Arma já carregada.');
      const charges = policy.soulCharges;
      if (!charges || !Number.isFinite(charges[soul]) || charges[soul] <= 0) fail('ACTION_UNAVAILABLE', 'Regra de recarga não configurada.');
      weapon.charge = Math.min(weapon.maxCharge, (weapon.charge || 0) + charges[soul]);
      events.push(movement(state, weapon, 0, cmd.action, weapon.count, { charge: weapon.charge }));
      if (record.reusableSoulGem) { row = separate(state, row); row.soul = 0; events.push(movement(state, row, 0, cmd.action, row.count, { soul: 0 })); }
      else emit(row, 1); break;
    }
    case 'destroy': {
      mutable();
      if (cmd.confirmed !== true) fail('CONFIRMATION_REQUIRED', 'Confirme a destruição do item.');
      emit(row, cmd.quantity, 'destroy', { permanent: true, disposition: 'destroyed', equipped: row.equipped || [] }); break;
    }
    case 'transfer': {
      mutable(); const interaction = policy.interaction;
      if (!interaction || !['transfer', 'sell'].includes(interaction.kind)) fail('FORBIDDEN', 'Transferência não autorizada.');
      const destination = states.get(interaction.characterId);
      if (!destination || destination === state) fail('FORBIDDEN', 'Destino inválido.');
      if (destination.revision !== interaction.expectedRevision) fail('REVISION_CONFLICT', 'Destino mudou.');
      const moved = { ...clone(row), id: row.count === cmd.quantity ? row.id : crypto.randomUUID(), count: cmd.quantity, equipped: [] };
      const gold = interaction.kind === 'sell' ? integer(interaction.unitPrice, 0) * cmd.quantity : 0;
      integer(gold, 0); if (destination.gold < gold) fail('INSUFFICIENT_GOLD', 'Comprador sem saldo.');
      state.gold = integer(state.gold + gold, 0); destination.gold -= gold;
      emit(row, cmd.quantity, interaction.kind, { destination: destination.characterId, gold });
      destination.items.push(moved); touched.add(destination.characterId);
      events.push(movement(destination, moved, moved.count, interaction.kind, 0, { source: state.characterId, gold: -gold })); break;
    }
    case 'collect': {
      const interaction = policy.interaction;
      if (interaction?.kind !== 'collect' || interaction.worldItem?.id !== cmd.worldItemId) fail('FORBIDDEN', 'Objeto inacessível.');
      const source = states.get(interaction.characterId);
      if (!source) fail('FORBIDDEN', 'Origem não encontrada.');
      const picked = item(source, interaction.itemId); catalog.get(picked.key);
      if (source.revision !== interaction.expectedRevision) fail('REVISION_CONFLICT', 'Objeto já foi coletado.');
      const moved = { ...clone(picked), equipped: [], favorite: false };
      events.push(movement(source, picked, -picked.count, 'collect', picked.count, { destination: state.characterId }));
      remove(source, picked, picked.count); state.items.push(moved); touched.add(source.characterId);
      events.push(movement(state, moved, moved.count, 'collect', 0, { source: source.characterId })); break;
    }
    default: fail('ACTION_UNAVAILABLE', 'Ação indisponível.');
  }
  const merged=[];
  for (const id of touched) {
    const s = states.get(id),redirects=mergeStacks(s);
    if(Object.keys(redirects).length){merged.push({characterId:id,redirects});if(id===state.characterId&&row&&redirects[row.id])row=item(s,redirects[row.id]);}
    s.revision += 1; invariant(s, catalog);
  }
  if(merged.length&&events.length)events[events.length-1].details={...events[events.length-1].details,merged};
  return { states, events, effects, touched: [...touched], result: { itemId: row?.id, revision: state.revision, bookAvailable: cmd.action === 'read' } };
}
module.exports = { execute, invariant, reconciled, weight, stackKey, item, mergeStacks };
