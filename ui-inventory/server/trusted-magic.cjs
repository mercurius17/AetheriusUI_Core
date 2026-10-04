'use strict';
const crypto=require('node:crypto');
const {object,identifier,integer,clone,fingerprint,fail,InventoryError}=require('../shared/contract.cjs');
const {reconciled,invariant}=require('./domain.cjs');
const {cleanupBindings}=require('./favorites.cjs');
const {activeEffects}=require('./magic-view.cjs');
// Host-only contract. Never registered on the CEF router. The caller must derive
// knowledge and active effects from authenticated server/game events, not CEF.
function trustedMagic(service,{allowedSources=[]}={}){
  const sources=new Set(allowedSources);
  return async function sync(input){
    object(input,['characterId','operationId','source','expectedRevision','knownSpells','knownPowers','knownShouts','shoutWords','activeEffects']);
    const {characterId,operationId,source,expectedRevision}=input;integer(characterId,1);identifier(operationId);identifier(source);integer(expectedRevision,0,Number.MAX_SAFE_INTEGER);
    if(!sources.has(source))fail('FORBIDDEN','Origem de magia não autorizada.');
    const op={id:operationId,characterId,fingerprint:fingerprint(input),action:'syncMagic',source,correlationId:crypto.randomUUID()};
    return service.store.transact([characterId],op,async states=>{
      try{
        const s=states.get(characterId);reconciled(s);
        if(s.revision!==expectedRevision)fail('REVISION_CONFLICT','Estado de magia mudou.');
        const before=clone(s.equippedAbilities||{});
        for(const [field,kind] of [['knownSpells','spell'],['knownPowers','power'],['knownShouts','shout']])if(input[field]!==undefined){
          if(!Array.isArray(input[field])||input[field].length>10000)fail('INVALID_PAYLOAD','Lista de habilidades inválida.');
          s[field]=[...new Set(input[field].map(key=>{identifier(key);if(service.abilities.get(key).kind!==kind)fail('INVALID_PAYLOAD','Tipo de habilidade incompatível.');return key;}))];
        }
        if(input.shoutWords!==undefined){
          object(input.shoutWords,s.knownShouts||[]);s.shoutWords={};for(const [key,count] of Object.entries(input.shoutWords)){service.abilities.owned(s,key);s.shoutWords[key]=integer(count,0,3);}
        }
        if(input.activeEffects!==undefined){
          if(!Array.isArray(input.activeEffects)||input.activeEffects.length>1000)fail('INVALID_PAYLOAD','Lista de efeitos inválida.');
          const seen=new Set();s.activeEffects=input.activeEffects.map(e=>{object(e,['id','name','description','magnitude','expiresAt']);identifier('effect:'+e.id);if(seen.has(e.id))fail('INVALID_PAYLOAD','Efeito duplicado.');seen.add(e.id);return clone(e);});activeEffects(s,0);
        }
        s.favoriteAbilities=(s.favoriteAbilities||[]).filter(key=>{try{service.abilities.owned(s,key);return true;}catch(e){if(!e.code)throw e;return false;}});
        for(const [slot,key] of Object.entries(s.equippedAbilities||{}))if(key){try{const r=service.abilities.owned(s,key);if(r.kind==='shout'&&!s.shoutWords?.[key])s.equippedAbilities[slot]=null;}catch(e){if(!e.code)throw e;s.equippedAbilities[slot]=null;}}
        cleanupBindings(s,service.abilities);s.revision++;invariant(s,service.catalog);
        const changed=JSON.stringify(before)!==JSON.stringify(s.equippedAbilities||{});
        if(changed&&(!service.runtime.supports('projection')||!service.runtime.supports('abilityEquip')))fail('ACTION_UNAVAILABLE','Projeção durável de habilidades indisponível.');
        return{states,touched:[characterId],events:[],effects:changed?[{type:'projection',characterId}]:[],result:{ok:true,operationId,revision:s.revision,magicChange:{source,knownSpells:s.knownSpells?.length||0,knownPowers:s.knownPowers?.length||0,knownShouts:s.knownShouts?.length||0,activeEffects:s.activeEffects?.length||0,previousEquipment:before,equipment:s.equippedAbilities||{}}}};
      }catch(e){if(!(e instanceof InventoryError))throw e;return{states,touched:[],events:[],effects:[],result:{ok:false,operationId,error:{code:e.code,message:e.message}}};}
    });
  };
}
module.exports={trustedMagic};
