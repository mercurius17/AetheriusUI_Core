'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createInventory}=require('../server/index.cjs');const {SqliteTestStore}=require('../server/stores/sqlite-test.cjs');
const {records,makeState,runtime}=require('../test-support/fixture.cjs');
const {trustedMovements}=require('../server/trusted-movements.cjs');const {projectInventory,createGamemodeRuntime}=require('../integrations/gamemode-runtime.cjs');
function fixture(t){const store=new SqliteTestStore();store.seed(makeState());const service=createInventory({records,pin:'fixture',expectedPin:'fixture',store,runtime:runtime(store,{admin:true})});t.after(()=>store.close());return{service,store};}
test('trusted reward API preserves provenance and rejects unknown source',async t=>{
  const {service,store}=fixture(t);const apply=trustedMovements(service,{allowedSources:['jobs']});
  const p={characterId:1,operationId:'job-reward',source:'jobs',reason:'woodcutting',movements:[{key:records[4].key,quantity:2}]};
  assert((await apply(p)).ok);assert((await apply(p)).replayed);assert.equal((await store.read(1)).items.filter(i=>i.key===records[4].key).reduce((n,i)=>n+i.count,0),5);
  await assert.rejects(apply({...p,source:'cheat'}),e=>e.code==='FORBIDDEN');
});
test('system removal and gold debit roll back together if item stock is missing',async t=>{
  const {service,store}=fixture(t);const apply=trustedMovements(service,{allowedSources:['crafting']});
  const outcome=await apply({characterId:1,operationId:'craft',source:'crafting',reason:'craft',goldDelta:-100,movements:[{key:records[4].key,quantity:-999}]});assert.equal(outcome.ok,false);assert.equal((await store.read(1)).gold,1275);assert.equal((await store.read(1)).revision,0);
});
test('unreconciled legacy state stays readable but blocks all projections and trusted grants',async t=>{
  const store=new SqliteTestStore(),s=makeState();t.after(()=>store.close());
  s.items[0].provenance={source:'legacy-sql',reviewRequired:true};s.items[0].locked=true;store.seed(s);
  const service=createInventory({records,pin:'fixture',expectedPin:'fixture',store,runtime:runtime(store,{admin:true})});
  assert((await service.snapshot({actorId:1})).items.length);
  const ui=await service.mutate({actorId:1},'setFavorite',{operationId:'legacy-ui',expectedRevision:0,itemId:'potion',favorite:false});
  assert.equal(ui.error.code,'NOT_RECONCILED');
  const grant=trustedMovements(service,{allowedSources:['jobs']});
  const reward=await grant({characterId:1,operationId:'legacy-reward',source:'jobs',reason:'reward',movements:[{key:records[4].key,quantity:1}]});
  assert.equal(reward.error.code,'NOT_RECONCILED');assert.equal((await store.read(1)).revision,0);assert.equal(await store.claim(),null);
});
test('unequip merges equivalent copies, retaining lineage and audit relation',async t=>{
  const {service,store}=fixture(t),c={actorId:1,correlationId:'equip-test'};
  const equip=await service.mutate(c,'equip',{operationId:'equip',expectedRevision:0,itemId:'sword',hand:'right'});
  await service.mutate(c,'unequip',{operationId:'unequip',expectedRevision:1,itemId:equip.itemId,hand:'auto'});
  const rows=(await store.read(1)).items.filter(i=>i.key===records[0].key);assert.equal(rows.length,1);assert.equal(rows[0].count,3);assert(rows[0].provenance.mergedFrom.length);const ledger=await store.audit({operationId:'unequip'});assert(ledger[0].details.merged.length);
});
test('native projection preserves extras and never accepts a runtime id from the UI',async t=>{
  const {service,store}=fixture(t);const s=await store.read(1);s.items.find(i=>i.id==='sword').name='Sword <script>evil</script>';const inventory=projectInventory(s,service.catalog,(key,baseId)=>baseId||0x1234);
  const staff=inventory.entries.find(e=>e.baseId===records.find(r=>r.tag==='staff').baseId);assert.equal(staff.chargePercent,20);assert.equal(staff.maxCharge,100);assert.equal(inventory.entries[0].name,'Sword <script>evil</script>');
});
test('gamemode permission uses view_audit and write requires verified fence',async()=>{
  const asked=[];const rt=createGamemodeRuntime({commands:{getActiveCharacterData:()=>({characterId:1})},admin:{hasPermission:(id,cap)=>{asked.push(cap);return true;}},native:{supports:()=>true,applyOnce:async()=>{}},fence:{verify:async()=>false}});
  assert(await rt.authorize({actorId:1},'inventory.audit'));assert.equal(asked[0],'view_audit');assert.equal(await rt.authorize({actorId:1},'inventory.write'),false);
});
test('handler registration cleans partial failures and unregisters exactly its own actions',t=>{
  const {service}=fixture(t),registered=new Map();const router={register:(id,action,fn)=>{if(registered.has(action))throw new Error('duplicate');registered.set(action,fn);return()=>registered.delete(action);}};
  const unload=service.register(router);assert(registered.has('snapshot'));assert(!registered.has('grant'));unload();unload();assert.equal(registered.size,0);
  let count=0;assert.throws(()=>service.register({register:()=>{if(++count===3)throw new Error('fail');return()=>count--;}}));assert.equal(count,1);
});
test('Core real protocol routes inventory using actor context; duplicate transport has one effect',async t=>{
  const {service}=fixture(t);const {AetheriusUiSystem}=require('../.local/core-system.cjs');const core=new AetheriusUiSystem();const unload=core.registerExternalModule('inventory',r=>service.register(r));t.after(unload);
  const EventEmitter=require('node:events');const gm=new EventEmitter(),sent=[];const ctx={gm,svr:{isConnected:()=>true,getUserActor:()=>1,sendCustomPacket:(user,json)=>sent.push(JSON.parse(json))}};
  await core.initAsync(ctx);gm.emit('spawnAllowed',11);const session=sent.find(r=>r.sessionId)?.sessionId;assert(session);assert(sent.find(r=>r.envelope?.moduleId==='core'&&r.envelope.kind==='snapshot').envelope.payload.navigation.find(r=>r.id==='inventory').available);
  const envelope={protocolVersion:1,kind:'request',messageId:'transport1',correlationId:'correlation1',sessionId:session,moduleId:'inventory',action:'setFavorite',payload:{operationId:'core-op',expectedRevision:0,itemId:'potion',favorite:false}};
  core.customPacket(11,'aetherius-ui:v1:request',{envelope},ctx);core.customPacket(11,'aetherius-ui:v1:request',{envelope},ctx);
  await new Promise(resolve=>setTimeout(resolve,40));const responses=sent.filter(r=>r.envelope?.correlationId==='correlation1');assert.equal(responses.length,2);assert(responses.every(r=>r.envelope.payload.ok));assert.equal((await service.store.read(1)).revision,1);
});
test('Core real protocol advertises FEITIÇOS and its favorites are visible through the inventory module',async t=>{
  const {abilities,addMagic}=require('../test-support/magic-fixture.cjs'),store=new SqliteTestStore();store.seed(addMagic(makeState()));t.after(()=>store.close());
  const service=createInventory({records,abilities,pin:'fixture',expectedPin:'fixture',store,runtime:runtime(store)}),{AetheriusUiSystem}=require('../.local/core-system.cjs'),core=new AetheriusUiSystem();
  t.after(core.registerExternalModule('inventory',r=>service.register(r)));t.after(core.registerExternalModule('spells',r=>service.registerSpells(r)));
  t.after(require('../integrations/register-native-map.cjs')(core));
  const EventEmitter=require('node:events'),gm=new EventEmitter(),sent=[],ctx={gm,svr:{isConnected:()=>true,getUserActor:()=>1,sendCustomPacket:(user,json)=>sent.push(JSON.parse(json))}};
  await core.initAsync(ctx);gm.emit('spawnAllowed',11);const sessionId=sent.find(r=>r.sessionId)?.sessionId;
  const nav=sent.find(r=>r.envelope?.moduleId==='core'&&r.envelope.kind==='snapshot').envelope.payload.navigation;assert(nav.find(r=>r.id==='spells').available);assert(nav.find(r=>r.id==='map').available);
  async function request(moduleId,action,payload,id){core.customPacket(11,'aetherius-ui:v1:request',{envelope:{protocolVersion:1,kind:'request',messageId:id,correlationId:id,sessionId,moduleId,action,payload}},ctx);await new Promise(resolve=>setTimeout(resolve,40));const envelope=sent.find(r=>r.envelope?.correlationId===id)?.envelope;assert(envelope,'Core response missing');return envelope.kind==='error'?{ok:false,error:envelope.error}:envelope.payload;}
  const snapshot=await request('spells','snapshot',{},'magic-read');assert.equal(snapshot.summary.known,7);
  const favorite=await request('spells','setAbilityFavorite',{operationId:'core-magic-favorite',expectedRevision:0,abilityId:abilities[4].key,favorite:true},'magic-favorite');assert(favorite.ok);
  const favorites=await request('inventory','favoritesSnapshot',{},'favorites-read');assert(favorites.items.some(r=>r.abilityId===abilities[4].key));
  const forged=await request('spells','destroy',{operationId:'spell-destroy',expectedRevision:1,itemId:'sword',quantity:1,confirmed:true},'magic-forged');assert.equal(forged.ok,false);assert.equal((await store.read(1)).items.find(r=>r.id==='sword').count,3);
});
