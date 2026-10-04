'use strict';
const crypto=require('node:crypto');
const {integer,identifier,object,clone,fingerprint,fail,InventoryError}=require('../shared/contract.cjs');
const {invariant,reconciled,mergeStacks}=require('./domain.cjs');
const {cleanupBindings}=require('./favorites.cjs');
/** Internal server API. Never registered as a browser/Core request action. */
function trustedMovements(service,{allowedSources}) {
  const sources=new Set(allowedSources||[]);
  return async function apply({characterId,operationId,source,reason,correlationId,movements,goldDelta=0}) {
    integer(characterId,1);identifier(operationId);identifier(source);identifier(reason);
    if(!sources.has(source))fail('FORBIDDEN','Sistema originador não autorizado.');
    if(!Number.isSafeInteger(goldDelta)||Math.abs(goldDelta)>2_147_483_647||!Array.isArray(movements)||movements.length>100)fail('INVALID_PAYLOAD','Movimentação inválida.');
    const input={source,reason,movements,goldDelta};
    return service.store.transact([characterId],{id:operationId,characterId,fingerprint:fingerprint(input),action:reason,source,correlationId:correlationId||crypto.randomUUID()},async states=>{
      try {
        const s=states.get(characterId),events=[];
        reconciled(s);
        if(!service.runtime.supports('projection'))fail('ACTION_UNAVAILABLE','Projeção autoritativa indisponível.');
        s.gold=integer(s.gold+goldDelta,0);
        for(const movement of movements){
          object(movement,['key','quantity','itemId','extras']);
          if(!Number.isSafeInteger(movement.quantity)||movement.quantity===0||Math.abs(movement.quantity)>2_147_483_647)fail('INVALID_PAYLOAD','Delta inválido.');
          const record=service.catalog.get(movement.key);
          if(movement.quantity>0){
            const extras=movement.extras||{};
            object(extras,['name','refinement','enchantment','charge','maxCharge','soul','poison','questItem','stolen','owner','locked']);
            const row={...clone(extras),id:crypto.randomUUID(),key:record.key,count:movement.quantity,equipped:[],favorite:false,provenance:{source,reason,operationId}};
            s.items.push(row);events.push({characterId,itemId:row.id,key:row.key,delta:row.count,beforeCount:0,afterCount:row.count,action:reason,details:{source}});
          }else{
            let remaining=-movement.quantity;
            const candidates=s.items.filter(i=>i.key===record.key&&(!movement.itemId||i.id===movement.itemId)&&!i.questItem&&!i.locked);
            if(candidates.reduce((n,i)=>n+i.count,0)<remaining)fail('INSUFFICIENT_ITEMS','Saldo insuficiente para movimento do sistema.');
            for(const row of candidates){if(!remaining)break;const n=Math.min(row.count,remaining),before=row.count;row.count-=n;remaining-=n;events.push({characterId,itemId:row.id,key:row.key,delta:-n,beforeCount:before,afterCount:row.count,action:reason,details:{source}});}
            s.items=s.items.filter(i=>i.count>0);
          }
        }
        const redirects=mergeStacks(s);if(events.length)events[events.length-1].details.merged=redirects;
        cleanupBindings(s,service.abilities,redirects);
        s.revision++;invariant(s,service.catalog);
        return{states,touched:[characterId],events,effects:[{type:'projection',characterId}],result:{ok:true,operationId,revision:s.revision}};
      }catch(e){if(!(e instanceof InventoryError))throw e;return{states,touched:[],events:[],effects:[],result:{ok:false,operationId,error:{code:e.code,message:e.message}}};}
    });
  };
}
module.exports={trustedMovements};
