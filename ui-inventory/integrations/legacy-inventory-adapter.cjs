'use strict';
const crypto=require('node:crypto');
const {trustedMovements}=require('../server/trusted-movements.cjs');
const {integer}=require('../shared/contract.cjs');
/** Replacement for legacy give/remove/has/sync after writer migration. */
function legacyInventoryAdapter(service,{commands,allowedSources}) {
  const apply=trustedMovements(service,{allowedSources});
  function owner(actorId,characterId){const active=commands.getActiveCharacterData(actorId);if(!active||active.characterId!==characterId)throw new Error('Authenticated character mismatch');}
  const change=async opts=>{
    owner(opts.actorId,opts.characterId);
    const record=service.catalog.byBaseId(opts.baseId);
    const result=await apply({characterId:opts.characterId,operationId:opts.idempotencyKey||crypto.randomUUID(),source:opts.module,reason:opts.reason,correlationId:opts.correlationId,movements:[{key:record.key,quantity:opts.delta}]});return result.ok;
  };
  return {
    giveItem:opts=>change({...opts,delta:integer(opts.count,1)}),removeItem:opts=>change({...opts,delta:-integer(opts.count,1)}),
    async hasItem(characterId,baseId,minCount=1){integer(minCount,1);const record=service.catalog.byBaseId(baseId),s=await service.store.read(characterId);return s.items.filter(r=>r.key===record.key&&!r.locked&&!r.questItem).reduce((n,r)=>n+r.count,0)>=minCount;},
    async syncInventoryToClient(actorId,characterId){owner(actorId,characterId);const s=await service.store.read(characterId);await service.runtime.applyDurable(`reconcile:${characterId}:${s.revision}`,{type:'projection',characterId,state:s},service.catalog);},
    clearSyncCache() {},
  };
}
module.exports={legacyInventoryAdapter};
