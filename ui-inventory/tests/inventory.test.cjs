'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createInventory}=require('../server/index.cjs');
const {SqliteTestStore}=require('../server/stores/sqlite-test.cjs');
const {records,makeState,runtime}=require('../test-support/fixture.cjs');
const {clone,command}=require('../shared/contract.cjs');
const {stackKey,invariant}=require('../server/domain.cjs');
const context={actorId:1,userId:11,correlationId:'test-correlation'};
function setup(t,options={}) {const store=new SqliteTestStore(options.path);store.seed(options.state||makeState());if(options.destination)store.seed(options.destination);const rt=runtime(store,options);const service=createInventory({records,pin:'fixture',expectedPin:'fixture',store,runtime:rt});t.after(()=>store.close());return {store,rt,service};}
function cmd(operationId,itemId,expectedRevision=0,extra={}){return{operationId,itemId,expectedRevision,...extra};}
test('parallel duplicate commands execute once and persist a replayable result',async t=>{
  const {service,store}=setup(t);const p=cmd('duplicate','potion');const results=await Promise.all(Array.from({length:12},()=>service.mutate(context,'consume',p)));
  assert(results.every(r=>r.ok));assert.equal(results.filter(r=>r.replayed).length,11);assert.equal((await store.read(1)).items.find(i=>i.id==='potion').count,2);assert.equal((await store.audit({operationId:'duplicate'})).length,1);
});
test('same operation key with a different command is rejected',async t=>{
  const {service}=setup(t);await service.mutate(context,'consume',cmd('same-key','potion'));
  await assert.rejects(service.mutate(context,'consume',cmd('same-key','food')),e=>e.code==='IDEMPOTENCY_CONFLICT');
});
test('two different operations with stale revision cannot double spend',async t=>{
  const {service,store}=setup(t);const r=await Promise.all(['one','two'].map(id=>service.mutate(context,'consume',cmd(id,'potion'))));
  assert.equal(r.filter(x=>x.ok).length,1);assert.equal(r.find(x=>!x.ok).error.code,'REVISION_CONFLICT');assert.equal((await store.read(1)).revision,1);
});
test('restart recovers operations and pending outbox without granting again',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aetherius-inventory-'));const file=path.join(dir,'inventory.sqlite');
  const first=new SqliteTestStore(file);first.seed(makeState());const rt=runtime(first);let svc=createInventory({records,pin:'fixture',expectedPin:'fixture',store:first,runtime:rt});
  await svc.mutate(context,'consume',cmd('survive-restart','potion'));first.close();
  const second=new SqliteTestStore(file);svc=createInventory({records,pin:'fixture',expectedPin:'fixture',store:second,runtime:rt});
  const replay=await svc.mutate({...context,userId:22},'consume',cmd('survive-restart','potion'));assert.equal(replay.replayed,true);await svc.drain();assert.equal((await svc.status(context,{operationId:'survive-restart'})).status,'applied');assert.equal((await second.read(1)).items.find(i=>i.id==='potion').count,2);second.close();
  t.after(()=>fs.rmSync(dir,{recursive:true}));
});
test('durable effect retried after lost acknowledgement has one logical application',async t=>{
  const {service,rt,store}=setup(t);const native=rt.applyDurable;let crash=true;
  rt.applyDurable=async(id,e,c)=>{await native(id,e,c);if(e.type==='consume'&&crash){crash=false;throw new Error('crash after effect receipt');}};
  await service.mutate(context,'consume',cmd('effect-crash','potion'));await service.drain();assert.equal((await service.status(context,{operationId:'effect-crash'})).status,'pending');await service.drain();assert.equal((await service.status(context,{operationId:'effect-crash'})).status,'applied');assert.equal(rt.log.filter(r=>r.effect.type==='consume').length,1);assert.equal((await store.read(1)).revision,1);
});
test('reusable idempotent projection always uses newest state, not old outbox snapshot',async t=>{
  const {service,rt}=setup(t);await service.mutate(context,'setFavorite',cmd('a','potion',0,{favorite:false}));await service.mutate(context,'setFavorite',cmd('b','food',1,{favorite:true}));await service.drain();assert(rt.log.filter(r=>r.effect.type==='projection').every(r=>r.effect.state.revision===2));
});
test('transfer conserves extras and quantity and changes both revisions',async t=>{
  const dest=makeState(2);dest.items=[];const interaction={kind:'transfer',characterId:2,expectedRevision:0};const {service,store}=setup(t,{destination:dest,interaction});
  const result=await service.mutate(context,'transfer',cmd('transfer-op','potion',0,{quantity:2,interactionId:'trade-session'}));assert(result.ok);
  const a=await store.read(1),b=await store.read(2);assert.equal(a.items.find(i=>i.id==='potion').count,1);assert.equal(b.items[0].count,2);assert.equal(a.revision,1);assert.equal(b.revision,1);assert.equal(b.items[0].key,a.items.find(i=>i.id==='potion').key);
});
test('sale settles both Gold and item atomically, refuses buyer insolvency',async t=>{
  const dest=makeState(2);dest.items=[];dest.gold=4;const interaction={kind:'sell',characterId:2,expectedRevision:0,unitPrice:20};const {service,store}=setup(t,{destination:dest,interaction});
  const result=await service.mutate(context,'transfer',cmd('sale','potion',0,{quantity:1,interactionId:'merchant'}));assert.equal(result.error.code,'INSUFFICIENT_GOLD');assert.equal((await store.read(1)).gold,1275);assert.equal((await store.read(2)).items.length,0);assert.equal((await store.read(1)).revision,0);
});
test('dual wield splits two copies of same base into distinct equipped instances',async t=>{
  const {service,store}=setup(t);const a=await service.mutate(context,'equip',cmd('right','sword',0,{hand:'right'}));assert(a.ok);const b=await service.mutate(context,'equip',cmd('left','sword',1,{hand:'left'}));assert(b.ok);const s=await store.read(1),equipped=s.items.filter(i=>i.key===s.items.find(i=>i.id==='sword').key&&i.equipped.length);assert.equal(equipped.length,2);assert.notEqual(equipped[0].id,equipped[1].id);assert.equal(s.items.filter(i=>i.key===equipped[0].key).reduce((n,i)=>n+i.count,0),3);invariant(s,service.catalog);
});
test('two handed weapon displaces both hands; ammo remains a stack',async t=>{
  const {service,store}=setup(t);await service.mutate(context,'equip',cmd('one','sword',0,{hand:'right'}));await service.mutate(context,'equip',cmd('two','shield',1,{hand:'left'}));await service.mutate(context,'equip',cmd('three','greatsword',2,{hand:'right'}));await service.mutate(context,'equip',cmd('ammo','arrow',3,{hand:'auto'}));const s=await store.read(1);assert.equal(s.items.find(i=>i.id==='greatsword').equipped.length,2);assert.equal(s.items.find(i=>i.id==='shield').equipped.length,0);assert.equal(s.items.find(i=>i.id==='arrow').count,48);invariant(s,service.catalog);
});
test('ingredient reveals only first effect and only after authorized consumption',async t=>{
  const {service}=setup(t);let before=await service.snapshot(context);assert.equal(before.items.find(i=>i.id==='ingredient').effects.length,0);await service.mutate(context,'consume',cmd('eat','ingredient'));const after=await service.snapshot(context);assert.deepEqual(after.items.find(i=>i.id==='ingredient').effects.map(e=>e.id),['heal']);
});
test('tome teaches once and does not consume another copy if already learned',async t=>{
  const s=makeState();s.items.find(i=>i.id==='tome').count=2;const {service,store}=setup(t,{state:s});await service.mutate(context,'learnTome',cmd('learn','tome'));const again=await service.mutate(context,'learnTome',cmd('learn2','tome',1));assert.equal(again.error.code,'SPELL_ALREADY_KNOWN');assert.equal((await store.read(1)).items.find(i=>i.id==='tome').count,1);
});
test('read leaves book in inventory, delivers text separately under transport budget',async t=>{
  const {service,store}=setup(t);const result=await service.mutate(context,'read',cmd('read','book'));assert(result.ok);assert(!('bookText' in result));assert.equal((await store.read(1)).items.find(i=>i.id==='book').count,1);const d=await service.details(context,{itemId:'book',expectedRevision:1});assert(d.text.includes('Tamriel'));
});
test('scroll is prepared without consumption and cast requires server interaction',async t=>{
  const {service,store,rt}=setup(t);await service.mutate(context,'equipScroll',cmd('prepare','scroll',0,{hand:'left'}));assert.equal((await store.read(1)).items.find(i=>i.id==='scroll').count,1);const rejected=await service.mutate(context,'castScroll',cmd('bad-cast','scroll',1,{interactionId:'cast'}));assert.equal(rejected.error.code,'FORBIDDEN');rt.validateInteraction=async()=>({kind:'cast',effect:{spell:'trusted'}});const success=await service.mutate(context,'castScroll',cmd('cast','scroll',1,{interactionId:'cast'}));assert(success.ok);assert(!((await store.read(1)).items.some(i=>i.id==='scroll')));
});
test('poison targets equipped weapon instance; soul gem recharges enchanted staff',async t=>{
  const {service,store}=setup(t);const equipped=await service.mutate(context,'equip',cmd('equip','sword',0,{hand:'right'}));await service.mutate(context,'applyPoison',cmd('poison','poison',1,{targetItemId:equipped.itemId}));await service.mutate(context,'recharge',cmd('charge','soul',2,{targetItemId:'staff'}));const s=await store.read(1);assert.equal(s.items.find(i=>i.id===equipped.itemId).poison.remaining,1);assert.equal(s.items.find(i=>i.id==='staff').charge,100);assert(!s.items.some(i=>i.id==='soul'));
});
test('locked quest item and excessive destruction preserve balance',async t=>{
  const s=makeState();s.items.find(i=>i.id==='book').questItem=true;const {service,store}=setup(t,{state:s,interaction:{kind:'destroy',location:{cell:'trusted'}}});
  assert.equal((await service.mutate(context,'destroy',cmd('quest','book',0,{quantity:1,confirmed:true}))).error.code,'ITEM_LOCKED');assert.equal((await service.mutate(context,'destroy',cmd('too-many','potion',0,{quantity:100,confirmed:true}))).error.code,'INSUFFICIENT_ITEMS');assert.equal((await store.read(1)).revision,0);
});
test('unknown/negative/fractional fields and client identities are rejected',()=>{
  for(const p of [cmd('x','sword',0,{hand:'auto',actorId:2}),cmd('x','sword',-1,{hand:'auto'}),cmd('x','sword',.5,{hand:'auto'})])assert.throws(()=>command('equip',p));for(const quantity of [0,-1,.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>command('destroy',cmd('x','sword',0,{quantity,confirmed:true})));
});
test('unauthorized actor cannot query audit or another inventory',async t=>{
  const {service,rt}=setup(t);await assert.rejects(service.audit(context,{}),e=>e.code==='FORBIDDEN');rt.resolveActor=async()=>({actorId:2,characterId:1});await assert.rejects(service.snapshot(context,{}),e=>e.code==='FORBIDDEN');
});
test('pagination respects envelope budget and rejects a stale continuation',async t=>{
  const s=makeState();for(let n=0;n<350;n++)s.items.push({...clone(s.items[0]),id:'copy-'+n,count:1,name:'Arma de nome longo '+n});const {service}=setup(t,{state:s});const first=await service.snapshot(context,{});assert(first.nextOffset);assert(Buffer.byteLength(JSON.stringify(first),'utf8')<12000);await service.mutate(context,'setFavorite',cmd('change','potion',0,{favorite:false}));await assert.rejects(service.snapshot(context,{offset:first.nextOffset,expectedRevision:0}),e=>e.code==='REVISION_CONFLICT');
});
test('stack equivalence includes all extras, charge, name and ownership',()=>{
  const base={id:'x',key:'Preview.esm:000001',count:1,charge:2,name:'Sword',stolen:false,equipped:[]};assert.notEqual(stackKey(base),stackKey({...base,charge:3}));assert.notEqual(stackKey(base),stackKey({...base,name:'Different'}));assert.notEqual(stackKey(base),stackKey({...base,stolen:true}));assert.equal(stackKey(base),stackKey({...base,id:'other',count:20}));
});
test('missing native capability refuses consumption, no simulated success',async t=>{
  const {service,store}=setup(t,{effects:new Set(['projection'])});const response=await service.mutate(context,'consume',cmd('unsupported','potion'));assert.equal(response.error.code,'ACTION_UNAVAILABLE');assert.equal((await store.read(1)).revision,0);
});
test('collector race grants world item once and preserves total stock',async t=>{
  const world=makeState(2);world.items=[{id:'world-sword',key:records[0].key,count:1,equipped:[]}];const interaction={kind:'collect',characterId:2,expectedRevision:0,itemId:'world-sword',worldItem:{id:'ref-1'}};const {service,store}=setup(t,{destination:world,interaction});
  const outcomes=await Promise.all(['pickup1','pickup2'].map(operationId=>service.mutate(context,'collect',{operationId,expectedRevision:0,worldItemId:'ref-1',interactionId:'world'})));assert.equal(outcomes.filter(r=>r.ok).length,1);assert.equal((await store.read(2)).items.length,0);assert.equal((await store.read(1)).items.filter(i=>i.key===records[0].key).reduce((n,i)=>n+i.count,0),4);
});
