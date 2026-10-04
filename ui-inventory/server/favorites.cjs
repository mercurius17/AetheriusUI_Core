'use strict';
const {identifier,fail,integer,clone}=require('../shared/contract.cjs');
const {item,reconciled,invariant}=require('./domain.cjs');
const SCHOOLS=['alteration','conjuration','destruction','illusion','restoration'];
// Trusted deployment catalog only. Learning/favoriting never grants ownership.
class AbilityCatalog {
  constructor(records=[]) {
    this.records=new Map();
    for(const input of records){
      const r=clone(input);identifier(r.key);
      if(!/^[^:]+\.(?:esm|esp|esl):[0-9a-f]{6}$/i.test(r.key)||!['spell','power','shout'].includes(r.kind)||typeof r.name!=='string'||!r.name.length||r.name.length>180||this.records.has(r.key))throw new Error('Invalid trusted ability catalog');
      if(r.school!==undefined&&!SCHOOLS.includes(r.school))throw new Error('Invalid magic school');
      for(const field of ['magickaCost','level','cooldown'])if(r[field]!==undefined&&(!Number.isFinite(r[field])||r[field]<0||r[field]>1e6))throw new Error('Invalid ability stat');
      if(r.description!==undefined&&(typeof r.description!=='string'||r.description.length>1500))throw new Error('Invalid ability description');
      if(r.powerType!==undefined&&!['greater','lesser'].includes(r.powerType))throw new Error('Invalid power type');
      if(r.twoHanded!==undefined&&(typeof r.twoHanded!=='boolean'||r.kind!=='spell'))throw new Error('Invalid spell hand requirement');
      if(r.words!==undefined&&(!Array.isArray(r.words)||r.words.length>3||r.words.some(w=>typeof w!=='string'||w.length>100)))throw new Error('Invalid shout words');
      r.effects=(r.effects||[]).map(e=>{identifier(e.id);if(typeof e.name!=='string'||e.name.length>300)throw new Error('Invalid ability effect');return Object.freeze({id:e.id,name:e.name});});
      this.records.set(r.key,Object.freeze(r));
    }
  }
  get(key){const r=this.records.get(key);if(!r)fail('ABILITY_UNAVAILABLE','Magia ou poder não consta no catálogo verificado.');return r;}
  owned(s,key){const r=this.get(key);if(!(r.kind==='power'?s.knownPowers||[]:r.kind==='shout'?s.knownShouts||[]:s.knownSpells||[]).includes(key))fail('ABILITY_NOT_KNOWN','Magia ou poder não conhecido pelo personagem.');return r;}
}
function favorite(s,id,abilities){
  if(id.startsWith('item:')){const row=item(s,id.slice(5));if(!row.favorite)fail('NOT_FAVORITE','Item não está nos favoritos.');return{type:'item',row};}
  if(id.startsWith('ability:')){const key=id.slice(8),record=abilities.owned(s,key);if(!(s.favoriteAbilities||[]).includes(key))fail('NOT_FAVORITE','Magia ou poder não favoritado.');return{type:'ability',key,record};}
  fail('INVALID_PAYLOAD','Favorito inválido.');
}
function cleanupBindings(s,abilities,redirects={}){
  const kept={};
  for(const [slot,id] of Object.entries(s.hotkeys||{})){
    if(!/^[1-9]$/.test(slot)||typeof id!=='string')continue;
    const target=id.startsWith('item:')&&redirects[id.slice(5)]?'item:'+redirects[id.slice(5)]:id;
    try{favorite(s,target,abilities);if(!Object.values(kept).includes(target))kept[slot]=target;}catch(e){if(!e.code)throw e;}
  }
  s.hotkeys=kept;
}
function executeFavorite(states,actor,cmd,catalog,abilities,policy,executeItem){
  policy={...policy,abilityCatalog:abilities};
  const s=states.get(actor.characterId);reconciled(s);
  if(s.revision!==cmd.expectedRevision)fail('REVISION_CONFLICT','Favoritos mudaram. Sincronize novamente.');
  if(cmd.action==='activateHotkey'){
    const id=s.hotkeys?.[cmd.slot];if(!id)fail('HOTKEY_UNASSIGNED','Atalho não mapeado.');
    const target=favorite(s,id,abilities);
    if(target.type==='ability')return executeFavorite(states,actor,{...cmd,action:'equipAbility',abilityId:target.key,hand:'auto'},catalog,abilities,policy,executeItem);
    const r=catalog.get(target.row.key);
    const action=r.equip?(r.equip.kind==='scroll'?'equipScroll':'equip'):['potions','food','ingredients'].includes(r.category)&&!r.poison?'consume':r.category==='books'&&!r.spellKey?'read':null;
    if(!action)fail('ACTION_UNAVAILABLE','Favorito sem ação rápida disponível.');
    return executeItem(states,actor,{...cmd,action,itemId:target.row.id,hand:'auto'},catalog,policy);
  }
  if(!['setHotkey','equipAbility','unequipAbility','setAbilityFavorite'].includes(cmd.action))return executeItem(states,actor,cmd,catalog,policy);
  let details;
  if(cmd.action==='setHotkey'){
    integer(cmd.slot,1,9);favorite(s,cmd.favoriteId,abilities);s.hotkeys||={};
    const before=clone(s.hotkeys);
    for(const slot of Object.keys(s.hotkeys))if(s.hotkeys[slot]===cmd.favoriteId)delete s.hotkeys[slot];
    s.hotkeys[cmd.slot]=cmd.favoriteId;details={before,after:clone(s.hotkeys)};
  }else{
    const r=abilities.owned(s,cmd.abilityId);
    if(cmd.action==='setAbilityFavorite'){
      const before=s.favoriteAbilities||[];s.favoriteAbilities=cmd.favorite?[...new Set([...before,r.key])]:before.filter(k=>k!==r.key);details={abilityId:r.key,before,after:s.favoriteAbilities};
    }else{
      if(!policy.supports('abilityEquip'))fail('ACTION_UNAVAILABLE','Adaptador autoritativo de magias/poderes indisponível.');
      if(cmd.action==='equipAbility'&&r.kind==='shout'&&!(s.shoutWords?.[r.key]>0))fail('SHOUT_LOCKED','Nenhuma palavra deste grito foi desbloqueada.');
      if(cmd.action==='equipAbility'&&policy.canEquipAbility&&!policy.canEquipAbility(actor,r,s))fail('EQUIPMENT_UNSUPPORTED','Habilidade incompatível com o personagem.');
      const before=clone(s.equippedAbilities||{}),displaced=[];
      if(cmd.action==='unequipAbility'){
        const slots=r.kind!=='spell'?['power']:r.twoHanded||cmd.hand==='auto'?['left','right']:[cmd.hand];
        const occupied=slots.filter(slot=>before[slot]===r.key);
        if(!occupied.length)fail('NOT_EQUIPPED','Magia ou poder não está equipado neste slot.');
        s.equippedAbilities={...before};for(const slot of occupied)s.equippedAbilities[slot]=null;
      }else{
        const slots=r.kind!=='spell'?['power']:r.twoHanded?['left','right']:[cmd.hand==='auto'?'right':cmd.hand];
        for(const row of s.items)if(row.equipped?.some(slot=>slots.includes(slot))){displaced.push({itemId:row.id,previous:row.equipped});row.equipped=[];}
        s.equippedAbilities={...before};
        for(const slot of slots){const previous=before[slot];if(previous&&abilities.owned(s,previous).twoHanded)for(const hand of ['left','right'])s.equippedAbilities[hand]=null;}
        for(const slot of slots)s.equippedAbilities[slot]=r.key;
      }
      details={abilityId:r.key,before,after:clone(s.equippedAbilities),displaced};
    }
  }
  cleanupBindings(s,abilities);s.revision++;invariant(s,catalog);
  // These operations are audited in the persistent operation result. The item
  // movement ledger deliberately carries item records only (MySQL FK contract).
  return{states,touched:[s.characterId],events:[],effects:[],result:{revision:s.revision,abilityId:cmd.abilityId,favoriteChange:details}};
}
module.exports={AbilityCatalog,favorite,cleanupBindings,executeFavorite,SCHOOLS};
