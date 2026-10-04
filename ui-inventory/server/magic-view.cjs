'use strict';
const {object,integer,identifier,fail,bytes}=require('../shared/contract.cjs');
const {invariant}=require('./domain.cjs');
// Read model of canonical server state. No browser request imports or learns magic.
function activeEffects(s,now=Date.now()){
  return (s.activeEffects||[]).map(e=>{
    identifier(e.id);
    if(typeof e.name!=='string'||!e.name.length||e.name.length>180||typeof (e.description||'')!=='string'||(e.description||'').length>1500||!Number.isFinite(e.magnitude)||Math.abs(e.magnitude)>1e6||e.expiresAt!==null&&(!Number.isSafeInteger(e.expiresAt)||e.expiresAt<0))fail('MAGIC_STATE_INVALID','Estado autoritativo de efeitos inválido.');
    return{id:'effect:'+e.id,name:e.name,category:'activeEffects',count:1,equipped:[],favorite:false,equip:{kind:'activeEffect'},effects:[],actions:[],magnitude:e.magnitude,expiresAt:e.expiresAt,remaining:e.expiresAt===null?null:Math.max(0,Math.ceil((e.expiresAt-now)/1000)),description:e.description||''};
  }).filter(e=>e.expiresAt===null||e.expiresAt>now);
}
async function snapshot(service,context,payload={}){
  object(payload,['offset','expectedRevision','asOf']);const actor=await service.actor(context),s=await service.store.read(actor.characterId);invariant(s,service.catalog);
  if(payload.expectedRevision!==undefined&&integer(payload.expectedRevision,0,Number.MAX_SAFE_INTEGER)!==s.revision)fail('REVISION_CONFLICT','Feitiços mudaram durante paginação.');
  const offset=payload.offset===undefined?0:integer(payload.offset,0,100000);
  const keys=[...new Set([...(s.knownSpells||[]),...(s.knownPowers||[]),...(s.knownShouts||[])])];
  const now=Date.now(),asOf=payload.asOf===undefined?now:integer(payload.asOf,Math.max(0,now-300000),now);
  const known=keys.map(key=>service.publicAbility(s,key)),effects=activeEffects(s,asOf),rows=[...known,...effects];
  const out={schemaVersion:1,revision:s.revision,asOf,catalogPin:service.catalog.pin,hotkeys:s.hotkeys||{},summary:{total:rows.length,known:known.length,activeEffects:effects.length},offset,items:[],nextOffset:null};
  for(const row of rows.slice(offset,offset+40)){if(bytes({...out,items:[...out.items,row]})>11500){if(!out.items.length)fail('ITEM_TOO_LARGE','Feitiço excede limite de página.');break;}out.items.push(row);}
  if(offset+out.items.length<rows.length)out.nextOffset=offset+out.items.length;
  return out;
}
async function details(service,context,payload){
  object(payload,['itemId','expectedRevision']);identifier(payload.itemId);
  if(payload.itemId.startsWith('ability:'))return service.details(context,payload);
  if(!payload.itemId.startsWith('effect:'))fail('INVALID_PAYLOAD','Seleção não pertence ao menu de feitiços.');
  const actor=await service.actor(context),s=await service.store.read(actor.characterId);
  if(integer(payload.expectedRevision,0,Number.MAX_SAFE_INTEGER)!==s.revision)fail('REVISION_CONFLICT','Efeito desatualizado.');
  const row=activeEffects(s).find(e=>e.id===payload.itemId);if(!row)fail('EFFECT_EXPIRED','Este efeito não está mais ativo.');
  return{schemaVersion:1,revision:s.revision,item:row,description:row.description,previewToken:null};
}
module.exports={snapshot,details,activeEffects};
