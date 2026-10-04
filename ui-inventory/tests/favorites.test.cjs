'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createInventory}=require('../server/index.cjs'),{SqliteTestStore}=require('../server/stores/sqlite-test.cjs'),{records,makeState,runtime}=require('../test-support/fixture.cjs');
const {command}=require('../shared/contract.cjs');
const abilities=[{key:'Preview.esm:001234',name:'Chamas',kind:'spell'},{key:'Preview.esm:001235',name:'Voz do norte',kind:'power'},{key:'Preview.esm:001236',name:'Desconhecida',kind:'spell'}];
const actor={actorId:1};
function setup(t,{state=makeState(),file,effects}={}){const store=new SqliteTestStore(file);store.seed(state);const rt=runtime(store,{effects});const service=createInventory({store,runtime:rt,records,abilities,pin:'test',expectedPin:'test'});t.after(()=>store.close());return{store,service,rt};}
function payload(operationId,expectedRevision,extra){return{operationId,expectedRevision,...extra};}
function magicState(){const s=makeState();s.knownSpells=[abilities[0].key];s.knownPowers=[abilities[1].key];s.favoriteAbilities=[abilities[0].key,abilities[1].key];return s;}
test('destruction debits once, audits permanent disposition and produces projection only',async t=>{
  const {service,store,rt}=setup(t);const p=payload('destroy-confirmed',0,{itemId:'potion',quantity:2,confirmed:true});
  const outcomes=await Promise.all(Array.from({length:8},()=>service.mutate(actor,'destroy',p)));
  assert.equal(outcomes.filter(r=>r.replayed).length,7);assert.equal((await store.read(1)).items.find(r=>r.id==='potion').count,1);
  const ledger=await store.audit({operationId:p.operationId});assert.equal(ledger.length,1);assert.equal(ledger[0].delta,-2);assert.equal(ledger[0].details.permanent,true);assert.equal(ledger[0].details.disposition,'destroyed');
  await service.drain();assert(rt.log.every(r=>r.effect.type==='projection'));assert.equal((await service.status(actor,{operationId:p.operationId})).status,'applied');
  assert.throws(()=>command('drop',payload('old-drop',1,{itemId:'potion',quantity:1,interactionId:'world'})),e=>e.code==='ACTION_UNAVAILABLE');
});
test('confirmation required; stale competing destroy cannot double spend',async t=>{
  for(const confirmed of [undefined,false,'true'])assert.throws(()=>command('destroy',payload('missing',0,{itemId:'potion',quantity:1,confirmed})),e=>e.code==='CONFIRMATION_REQUIRED');
  const {service,store}=setup(t);const outcomes=await Promise.all(['one','two'].map(id=>service.mutate(actor,'destroy',payload(id,0,{itemId:'potion',quantity:2,confirmed:true}))));assert.equal(outcomes.filter(r=>r.ok).length,1);assert.equal(outcomes.find(r=>!r.ok).error.code,'REVISION_CONFLICT');assert.equal((await store.read(1)).items.find(r=>r.id==='potion').count,1);
});
test('hotkeys persist across restart, reassignment is exclusive, replay never consumes twice',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aetherius-hotkeys-'));const file=path.join(dir,'state.sqlite');
  let store=new SqliteTestStore(file);store.seed(makeState());let service=createInventory({store,runtime:runtime(store),records,abilities,pin:'test',expectedPin:'test'});
  assert((await service.mutate(actor,'setHotkey',payload('map1',0,{favoriteId:'item:potion',slot:1}))).ok);
  assert((await service.mutate(actor,'setHotkey',payload('map2',1,{favoriteId:'item:potion',slot:9}))).ok);store.close();
  store=new SqliteTestStore(file);t.after(()=>{store.close();const resolved=path.resolve(dir);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('aetherius-hotkeys-'))throw new Error('Unsafe test cleanup path');fs.rmSync(resolved,{recursive:true});});service=createInventory({store,runtime:runtime(store),records,abilities,pin:'test',expectedPin:'test'});
  assert.deepEqual((await service.favoritesSnapshot(actor)).hotkeys,{9:'item:potion'});
  const p=payload('use9',2,{slot:9});await service.mutate(actor,'activateHotkey',p);await service.mutate(actor,'activateHotkey',p);assert.equal((await store.read(1)).items.find(r=>r.id==='potion').count,2);
  const p2=payload('replace9',3,{favoriteId:'item:sword',slot:9});await service.mutate(actor,'setHotkey',p2);assert.deepEqual((await store.read(1)).hotkeys,{9:'item:sword'});
});
test('unfavorite and destruction invalidate bindings; stale or malicious mappings refuse',async t=>{
  const {service,store}=setup(t);assert.equal((await service.mutate(actor,'setHotkey',payload('not-fav',0,{favoriteId:'item:food',slot:2}))).error.code,'NOT_FAVORITE');
  await service.mutate(actor,'setHotkey',payload('map',0,{favoriteId:'item:potion',slot:2}));await service.mutate(actor,'destroy',payload('destroy',1,{itemId:'potion',quantity:3,confirmed:true}));assert.deepEqual((await store.read(1)).hotkeys,{});
  assert.equal((await service.mutate(actor,'activateHotkey',payload('removed',2,{slot:2}))).error.code,'HOTKEY_UNASSIGNED');
  await service.mutate(actor,'setHotkey',payload('sword-map',2,{favoriteId:'item:sword',slot:4}));await service.mutate(actor,'setFavorite',payload('unfavorite',3,{itemId:'sword',favorite:false}));assert.deepEqual((await store.read(1)).hotkeys,{});
  for(const slot of [0,10,1.5,'1'])assert.throws(()=>command('setHotkey',payload('invalid',4,{favoriteId:'item:sword',slot})));
  assert.throws(()=>command('activateHotkey',payload('forged',4,{slot:1,itemId:'sword',action:'consume'})));
});
test('favorites join known abilities only, preserve ownership and allow both hands and power slot',async t=>{
  const {service,store,rt}=setup(t,{state:magicState()});const list=await service.favoritesSnapshot(actor);assert.equal(list.items.filter(r=>r.abilityId).length,2);
  assert.equal((await service.mutate(actor,'setAbilityFavorite',payload('unknown',0,{abilityId:abilities[2].key,favorite:true}))).error.code,'ABILITY_NOT_KNOWN');
  await service.mutate(actor,'equip',payload('great',0,{itemId:'greatsword',hand:'auto'}));
  await service.mutate(actor,'equipAbility',payload('left',1,{abilityId:abilities[0].key,hand:'left'}));assert.deepEqual((await store.read(1)).items.find(r=>r.id==='greatsword').equipped,[]);
  await service.mutate(actor,'equipAbility',payload('right',2,{abilityId:abilities[0].key,hand:'right'}));
  await service.mutate(actor,'setHotkey',payload('power-map',3,{favoriteId:'ability:'+abilities[1].key,slot:3}));await service.mutate(actor,'activateHotkey',payload('power-use',4,{slot:3}));
  let s=await store.read(1);assert.deepEqual(s.equippedAbilities,{left:abilities[0].key,right:abilities[0].key,power:abilities[1].key});
  await service.mutate(actor,'equip',payload('two',5,{itemId:'greatsword',hand:'auto'}));s=await store.read(1);assert.equal(s.equippedAbilities.left,null);assert.equal(s.equippedAbilities.right,null);assert.equal(s.equippedAbilities.power,abilities[1].key);
  await service.drain();assert(rt.log.every(r=>r.effect.type==='projection'));assert.equal(rt.log[0].effect.state.equippedAbilities.power,abilities[1].key);
  const result=await service.status(actor,{operationId:'power-use'});assert.equal(result.favoriteChange.abilityId,abilities[1].key);
});
test('missing durable ability support blocks equipment and no state revision advances',async t=>{
  const {service,store}=setup(t,{state:magicState(),effects:new Set(['projection'])});assert.equal((await service.mutate(actor,'equipAbility',payload('unsupported',0,{abilityId:abilities[0].key,hand:'left'}))).error.code,'ACTION_UNAVAILABLE');assert.equal((await store.read(1)).revision,0);
});
test('split/merge keeps a hotkey on a surviving favorite instance',async t=>{
  const {service,store}=setup(t);const equipped=await service.mutate(actor,'equip',payload('equip',0,{itemId:'sword',hand:'left'}));await service.mutate(actor,'setHotkey',payload('map',1,{favoriteId:'item:'+equipped.itemId,slot:5}));await service.mutate(actor,'unequip',payload('merge',2,{itemId:equipped.itemId,hand:'auto'}));const s=await store.read(1);assert(s.items.some(r=>'item:'+r.id===s.hotkeys[5]&&r.favorite));assert((await service.mutate(actor,'activateHotkey',payload('use',3,{slot:5}))).ok);
});
test('momentum accelerates with repeated wheel input, decays and reverses without drift',()=>{
  const {step,impulse}=require('../ui/momentum-scroll.js');let v=impulse(0,80);const repeated=impulse(v,80);assert(repeated>v);assert(impulse(3600,120)<=3600);assert(impulse(repeated,-80)<0);const next=step(repeated,.016);assert(next.velocity<repeated);assert(next.distance>0);let distance=0;for(let i=0;i<300;i++){const r=step(v,.016);distance+=r.distance;v=r.velocity;}assert(v<.01);assert(Math.abs(distance-100)<.01);
});
test('exclusive host adapter delegates Q and gameplay digits, skips repeats and CEF mapping input',()=>{
  const {bindFavoritesInput}=require('../integrations/favorites-input-adapter.cjs');assert.throws(()=>bindFavoritesInput({}),/Missing exclusive/);
  const handlers={},calls=[],removed=[];const host={registerExclusiveControl:(k,fn)=>(handlers[k]=fn,()=>removed.push(k)),registerExclusiveKey:(k,fn)=>(handlers[k]=fn,()=>removed.push(k)),canOpen:()=>true,showMainView:fn=>{calls.push('show');fn();},executeMainView:js=>calls.push(js),activateHotkey:slot=>calls.push(slot)};
  const cleanup=bindFavoritesInput(host);assert.equal(handlers.Favorites({isDown:true}),true);assert(calls[1].includes('openFavorites'));assert.equal(handlers.Favorites({isDown:true,cefFocused:true}),false);assert.equal(handlers['9']({isDown:true,cefFocused:true}),false);assert.equal(handlers['9']({isDown:true,repeat:true}),false);assert.equal(handlers['9']({isDown:true}),true);assert.equal(calls.at(-1),9);cleanup();cleanup();assert.equal(removed.length,10);
});
test('old committed drop outbox is held for reconciliation and never creates a world item',async t=>{
  const {service,store,rt}=setup(t);
  await store.transact([1],{id:'legacy-drop',characterId:1,fingerprint:'legacy',action:'drop'},async states=>({states,touched:[],events:[],effects:[{type:'drop',characterId:1,worldItem:{id:'old-world'}}],result:{ok:true}}));
  await service.drain();assert.equal(rt.log.length,0);assert.equal((await store.operation(1,'legacy-drop')).status,'pending');
});
test('wheel integration respects bounds, reduced motion, repeated impulses and disposal',()=>{
  const vm=require('node:vm');let callback=null,now=0,position=0,reduced=false,handler,removed=0;
  const target={isConnected:true,scrollHeight:500,clientHeight:100,get scrollTop(){return position;},set scrollTop(v){position=Math.max(0,Math.min(400,v));}};
  const container={contains:()=>true,addEventListener:(_,fn)=>handler=fn,removeEventListener:()=>removed++};
  const win={matchMedia:()=>({matches:reduced})};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui/momentum-scroll.js'),'utf8'),{window:win,performance:{now:()=>now},requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame:()=>callback=null});
  const scroll=win.AetheriusMomentumScroll.attach(container),event=delta=>({target:{closest:()=>target},deltaY:delta,deltaMode:0,preventDefault(){}});
  function tick(){const next=callback;callback=null;now+=16;next?.(now);}
  handler(event(40));tick();const first=position;handler(event(40));tick();assert(position-first>first);
  for(let i=0;i<300&&callback;i++)tick();assert(!scroll.moving);assert(position<=400);
  position=390;handler(event(200));for(let i=0;i<30&&callback;i++)tick();assert.equal(position,400);assert(!scroll.moving);
  reduced=true;handler(event(-80));assert.equal(position,320);assert(!scroll.moving);
  scroll.dispose();assert.equal(removed,1);assert.equal(callback,null);
});
