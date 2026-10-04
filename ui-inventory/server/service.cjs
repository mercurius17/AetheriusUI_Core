'use strict';
const crypto=require('node:crypto');
const {command,object,integer,identifier,fail,InventoryError,fingerprint,bytes,clone,ACTION_FIELDS}=require('../shared/contract.cjs');
const {execute,invariant,reconciled,weight,item}=require('./domain.cjs');
const {AbilityCatalog,executeFavorite,cleanupBindings}=require('./favorites.cjs');
class InventoryService {
  constructor({store,catalog,runtime,abilities=[]}) {
    for(const name of ['resolveActor','authorize','supports','applyDurable','validateInteraction'])if(typeof runtime?.[name]!=='function')throw new Error(`Missing authoritative runtime.${name}`);
    this.store=store;this.catalog=catalog;this.runtime=runtime;this.draining=false;
    this.abilities=new AbilityCatalog(abilities);
  }
  async actor(context,capability='inventory.read') {
    integer(context.actorId,1,0xffffffff);
    const actor=await this.runtime.resolveActor(context);
    if(!actor||!Number.isSafeInteger(actor.characterId)||actor.characterId<1||actor.actorId!==context.actorId||!await this.runtime.authorize(context,capability,actor))fail('FORBIDDEN','Acesso ao inventário negado.');
    return actor;
  }
  publicItem(s,row) {
    const r=this.catalog.get(row.key);
    const effects=r.category==='ingredients'?(r.effects||[]).filter(e=>(s.knownEffects[row.key]||[]).includes(e.id)):(r.effects||[]);
    return {id:row.id,key:row.key,name:row.name||r.name,category:r.category,count:row.count,weight:r.weight,value:r.value,damage:r.damage,armor:r.armor,equipped:row.equipped||[],favorite:!!row.favorite,questItem:!!row.questItem,stolen:!!row.stolen,charge:row.charge,maxCharge:row.maxCharge,soul:row.soul??r.soul,poison:row.poison,enchanted:!!row.enchantment,equip:r.equip,effects:effects.map(e=>({id:e.id,name:e.name})),actions:this.actions(s,row,r)};
  }
  actions(s,row,r) {
    const supported=type=>this.runtime.supports(type);
    const locked=row.questItem||row.locked,actions=['setFavorite'];
    if(r.equip){actions.push(r.equip.kind==='scroll'?'equipScroll':'equip');if(row.equipped?.length)actions.push('unequip');}
    if(!locked&&['potions','food','ingredients'].includes(r.category)&&!r.poison&&supported('consume'))actions.push('consume');
    if(r.category==='books'&&!r.spellKey&&(!r.readEffect||s.readBooks.includes(r.key)||supported('readEffect')))actions.push('read');
    if(!locked&&r.spellKey&&supported('learnSpell')&&!s.knownSpells.includes(r.spellKey))actions.push('learnTome');
    if(!locked&&r.poison)actions.push('applyPoison');
    if(!locked&&r.soulGem&&(row.soul??r.soul)>0)actions.push('recharge');
    if(!locked&&supported('projection'))actions.push('destroy');
    if(!locked&&this.runtime.interactions)actions.push('transfer');
    return actions;
  }
  async snapshot(context,payload={},favoritesOnly=false) {
    object(payload,['offset','expectedRevision']);const actor=await this.actor(context);
    const s=await this.store.read(actor.characterId);invariant(s,this.catalog);
    if(payload.expectedRevision!==undefined&&integer(payload.expectedRevision,0,Number.MAX_SAFE_INTEGER)!==s.revision)fail('REVISION_CONFLICT','Inventário mudou durante paginação.');
    const offset=payload.offset===undefined?0:integer(payload.offset,0,100000);
    const rows=s.items.filter(r=>!favoritesOnly||r.favorite).map(r=>({...this.publicItem(s,r),favoriteId:'item:'+r.id}));
    for(const key of (favoritesOnly?s.favoriteAbilities||[]:[])){
      try{rows.push(this.publicAbility(s,key));}catch(e){if(!e.code)throw e;}
    }
    const base={schemaVersion:1,revision:s.revision,catalogPin:this.catalog.pin,hotkeys:s.hotkeys||{},summary:{gold:s.gold,weight:weight(s,this.catalog),carryWeight:s.carryWeight,total:rows.length},offset,items:[],nextOffset:null};
    for(let index=offset;index<rows.length&&base.items.length<40;index++) {
      const row=rows[index];
      if(bytes({...base,items:[...base.items,row]})>11500){if(!base.items.length)fail('ITEM_TOO_LARGE','Detalhes excedem limite de página.');break;}
      base.items.push(row);
    }
    if(offset+base.items.length<rows.length)base.nextOffset=offset+base.items.length;
    return base;
  }
  favoritesSnapshot(context,payload={}){return this.snapshot(context,payload,true);}
  magicSnapshot(context,payload={}){return require('./magic-view.cjs').snapshot(this,context,payload);}
  magicDetails(context,payload){return require('./magic-view.cjs').details(this,context,payload);}
  publicAbility(s,key){
    const r=this.abilities.owned(s,key),id='ability:'+key;
    const equipped=Object.keys(s.equippedAbilities||{}).filter(slot=>s.equippedAbilities[slot]===key);
    const unlockedWords=r.kind==='shout'?integer(s.shoutWords?.[key]||0,0,3):undefined;
    const canEquip=this.runtime.supports('abilityEquip')&&(r.kind!=='shout'||unlockedWords>0);
    return{id,abilityId:key,favoriteId:id,key,name:r.name,category:r.kind==='power'?'powers':r.kind==='shout'?'shouts':'spells',school:r.school,magickaCost:r.magickaCost,level:r.level,cooldown:r.cooldown,powerType:r.powerType,words:r.words?.slice(0,unlockedWords||0),unlockedWords,count:1,equipped,favorite:(s.favoriteAbilities||[]).includes(key),equip:{kind:r.kind,twoHanded:r.twoHanded},effects:r.effects,actions:['setAbilityFavorite',...(canEquip?['equipAbility']:[]),...(this.runtime.supports('abilityEquip')&&equipped.length?['unequipAbility']:[])]};
  }
  async details(context,payload) {
    object(payload,['itemId','expectedRevision','textOffset']);identifier(payload.itemId);
    const actor=await this.actor(context),s=await this.store.read(actor.characterId);
    if(integer(payload.expectedRevision,0,Number.MAX_SAFE_INTEGER)!==s.revision)fail('REVISION_CONFLICT','Seleção desatualizada.');
    if(payload.itemId.startsWith('ability:'))return{schemaVersion:1,revision:s.revision,item:this.publicAbility(s,payload.itemId.slice(8)),description:this.abilities.owned(s,payload.itemId.slice(8)).description||'',previewToken:null};
    const row=item(s,payload.itemId),record=this.catalog.get(row.key),offset=payload.textOffset===undefined?0:integer(payload.textOffset,0,1000000);
    const text=record.bookText||'';
    // Text is delivered as data and rendered with textContent, never HTML.
    let end=Math.min(offset+2000,text.length);if(end>offset&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;
    const previewToken=typeof this.runtime.previewToken==='function'?await this.runtime.previewToken(actor,row,record):null;
    const out={schemaVersion:1,revision:s.revision,item:this.publicItem(s,row),description:record.description||'',enchantment:row.enchantment||null,previewToken,text:text.slice(offset,end),textOffset:offset,nextTextOffset:end<text.length?end:null};
    if(bytes(out)>11500)fail('ITEM_TOO_LARGE','Descrição excede limite.');return out;
  }
  async mutate(context,action,payload) {
    const cmd=command(action,payload),actor=await this.actor(context,'inventory.write');
    if(!this.runtime.supports('projection'))fail('ACTION_UNAVAILABLE','Projeção autoritativa indisponível.');
    const hint=cmd.interactionId?await this.runtime.validateInteraction(actor,cmd):null;
    const ids=[actor.characterId];if(hint?.characterId)ids.push(integer(hint.characterId,1));
    const op={id:cmd.operationId,characterId:actor.characterId,actorId:actor.actorId,fingerprint:fingerprint(cmd),action,correlationId:context.correlationId||crypto.randomUUID(),source:'ui-inventory'};
    return this.store.transact(ids,op,async states=>{
      try {
        // Recheck authenticated character after waiting for row locks / reconnect.
        const current=await this.actor(context,'inventory.write');
        if(current.characterId!==actor.characterId)fail('SESSION_MISMATCH','Personagem ativo mudou.');
        const interaction=cmd.interactionId?await this.runtime.validateInteraction(actor,cmd,states):null;
        if(interaction?.characterId&&!states.has(interaction.characterId))fail('FORBIDDEN','Contexto de interação mudou.');
        const change=executeFavorite(states,actor,cmd,this.catalog,this.abilities,{supports:type=>this.runtime.supports(type),canEquip:this.runtime.canEquip?.bind(this.runtime),canEquipAbility:this.runtime.canEquipAbility?.bind(this.runtime),soulCharges:this.runtime.soulCharges,interaction},execute);
        for(const id of change.touched){const redirects={};for(const event of change.events)for(const merge of event.details?.merged||[])if(merge.characterId===id)Object.assign(redirects,merge.redirects);cleanupBindings(change.states.get(id),this.abilities,redirects);}
        const projections=change.touched.map(characterId=>({type:'projection',characterId}));
        return {...change,effects:[...projections,...change.effects],result:{ok:true,schemaVersion:1,operationId:cmd.operationId,...change.result}};
      }catch(error){if(!(error instanceof InventoryError))throw error;return {states,touched:[],events:[],effects:[],result:{ok:false,schemaVersion:1,operationId:cmd.operationId,error:{code:error.code,message:error.message}}};}
    });
  }
  async status(context,payload) {
    object(payload,['operationId']);identifier(payload.operationId);const actor=await this.actor(context);
    return await this.store.operation(actor.characterId,payload.operationId)||{ok:false,status:'unknown',operationId:payload.operationId};
  }
  async audit(context,payload) {
    object(payload,['characterId','operationId','itemId','action','after','limit','from','to']);await this.actor(context,'inventory.audit');
    const f={...payload};for(const k of ['characterId','after','limit'])if(f[k]!==undefined)integer(f[k],k==='after'?0:1,k==='limit'?50:2_147_483_647);
    for(const k of ['operationId','itemId','action'])if(f[k]!==undefined)identifier(f[k]);
    for(const k of ['from','to'])if(f[k]!==undefined&&(typeof f[k]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(f[k])||!Number.isFinite(Date.parse(f[k]))))fail('INVALID_PAYLOAD','Data UTC inválida.');
    const rows=await this.store.audit({...f,limit:f.limit||40}),page=[];
    for(const row of rows){if(bytes({rows:[...page,row]})>11500)break;page.push(row);}
    return {schemaVersion:1,rows:page,nextAfter:page.length?page[page.length-1].id:null};
  }
  async drain(max=20) {
    if(this.draining)return;this.draining=true;
    try {for(let n=0;n<max;n++) {
      const job=await this.store.claim();if(!job)break;
      let error;
      try {
        const effect=clone(job.effect);
        if(effect.type==='drop')fail('LEGACY_DROP_REQUIRES_RECONCILIATION','Outbox antiga de drop exige reconciliação administrativa.');
        if(effect.type==='projection'){
          effect.state=await this.store.read(effect.characterId);invariant(effect.state,this.catalog);reconciled(effect.state);
          if(Object.keys(effect.state.equippedAbilities||{}).length){
            if(!this.runtime.supports('abilityEquip'))fail('ACTION_UNAVAILABLE','Projeção de magias/poderes indisponível.');
            effect.abilities=[...new Set(Object.values(effect.state.equippedAbilities).filter(Boolean))].map(key=>this.abilities.owned(effect.state,key));
          }
        }
        // Host must persist receipt with native gameplay effect; no client ACK used.
        await this.runtime.applyDurable(job.id,effect,this.catalog);
      }catch(e){error=e;}
      await this.store.finish(job,error);if(error)break;
    }}finally{this.draining=false;}
  }
  register(router) {
    const clean=[];
    const handler=fn=>async(ctx,p)=>{try{return await fn(ctx,p);}catch(e){if(e instanceof InventoryError)return{ok:false,error:{code:e.code,message:e.message}};throw e;}};
    try {
      for(const [action,fn] of Object.entries({snapshot:this.snapshot.bind(this),favoritesSnapshot:this.favoritesSnapshot.bind(this),itemDetails:this.details.bind(this),operationStatus:this.status.bind(this),audit:this.audit.bind(this)}))clean.push(router.register('inventory',action,handler(fn)));
      for(const action of Object.keys(ACTION_FIELDS))clean.push(router.register('inventory',action,handler((c,p)=>this.mutate(c,action,p))));
    }catch(e){clean.reverse().forEach(f=>f());throw e;}
    const timer=setInterval(()=>this.drain().catch(()=>{}),2000);timer.unref?.();
    return ()=>{clearInterval(timer);clean.splice(0).reverse().forEach(f=>f());};
  }
  registerSpells(router){
    const clean=[],handler=fn=>async(c,p)=>{try{return await fn(c,p);}catch(e){if(e instanceof InventoryError)return{ok:false,error:{code:e.code,message:e.message}};throw e;}};
    try{
      for(const [action,fn] of Object.entries({snapshot:this.magicSnapshot.bind(this),itemDetails:this.magicDetails.bind(this),operationStatus:this.status.bind(this)}))clean.push(router.register('spells',action,handler(fn)));
      for(const action of ['equipAbility','unequipAbility','setAbilityFavorite'])clean.push(router.register('spells',action,handler((c,p)=>this.mutate(c,action,p))));
    }catch(e){clean.reverse().forEach(f=>f());throw e;}
    return()=>clean.splice(0).reverse().forEach(f=>f());
  }
}
module.exports={InventoryService};
