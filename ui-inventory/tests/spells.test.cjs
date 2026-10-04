'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createInventory}=require('../server/index.cjs'),{SqliteTestStore}=require('../server/stores/sqlite-test.cjs'),{records,makeState,runtime}=require('../test-support/fixture.cjs'),{abilities,addMagic}=require('../test-support/magic-fixture.cjs');
function fixture(t,options={}){const store=new SqliteTestStore();t.after(()=>store.close());const s=options.state||addMagic(makeState());store.seed(s);const rt=runtime(store,options);return{store,rt,service:createInventory({records,abilities:options.abilities||abilities,pin:'magic-test',expectedPin:'magic-test',store,runtime:rt})};}
const c={actorId:1};
test('magic snapshot includes exactly known schools, powers, shouts and live canonical effects',async t=>{
  const s=addMagic(makeState());s.activeEffects.push({id:'expired',name:'Expired',magnitude:2,expiresAt:Date.now()-1});
  const {service}=fixture(t,{state:s}),snapshot=await service.magicSnapshot(c);
  assert.equal(snapshot.summary.known,7);assert.equal(snapshot.summary.activeEffects,2);assert.equal(snapshot.items.length,9);assert(snapshot.items.every(r=>r.abilityId||r.id.startsWith('effect:')));assert.deepEqual(snapshot.items.find(r=>r.category==='shouts').words,['Fus','Ro']);
  const details=await service.magicDetails(c,{itemId:'ability:'+abilities[0].key,expectedRevision:0});assert(details.description.includes('fogo'));
  const effect=await service.magicDetails(c,{itemId:'effect:rested',expectedRevision:0});assert.equal(effect.item.remaining,null);assert.deepEqual(effect.item.actions,[]);
  await assert.rejects(service.magicDetails(c,{itemId:'effect:expired',expectedRevision:0}),e=>e.code==='EFFECT_EXPIRED');
  await assert.rejects(service.magicDetails(c,{itemId:'sword',expectedRevision:0}),e=>e.code==='INVALID_PAYLOAD');
});
test('spells transport only registers read, status, equip, unequip and favorites; missing capability blocks equip',async t=>{
  const {service}=fixture(t,{effects:new Set(['projection'])}),handlers=new Map();const unload=service.registerSpells({register:(id,action,fn)=>{assert.equal(id,'spells');handlers.set(action,fn);return()=>handlers.delete(action);}});t.after(unload);
  assert.equal(handlers.size,6);assert(!handlers.has('destroy'));assert(!handlers.has('learnTome'));assert(!handlers.has('setHotkey'));
  assert(!(await handlers.get('snapshot')(c,{})).items.find(r=>r.abilityId).actions.includes('equipAbility'));
  const result=await handlers.get('equipAbility')(c,{operationId:'native-missing',expectedRevision:0,abilityId:abilities[0].key,hand:'left'});assert.equal(result.error.code,'ACTION_UNAVAILABLE');
  unload();assert.equal(handlers.size,0);
});
test('shouts need unlocked words, share the power slot and use the same favorite hotkey authority',async t=>{
  const s=addMagic(makeState()),shout=s.knownShouts[0],power=s.knownPowers[0];s.shoutWords[shout]=0;
  const {service,store}=fixture(t,{state:s});const p={operationId:'locked',expectedRevision:0,abilityId:shout,hand:'right'};
  assert.equal((await service.mutate(c,'equipAbility',p)).error.code,'SHOUT_LOCKED');assert.equal((await store.read(1)).revision,0);
  const sync=require('../server/trusted-magic.cjs').trustedMagic(service,{allowedSources:['game']});
  assert((await sync({characterId:1,operationId:'unlock',source:'game',expectedRevision:0,shoutWords:{[shout]:2}})).ok);
  p.expectedRevision=1;
  const equip=await service.mutate(c,'equipAbility',{...p,operationId:'unlocked'});await service.drain();assert(equip.ok);assert.equal((await store.read(1)).equippedAbilities.power,shout);
  await service.mutate(c,'equipAbility',{operationId:'power',expectedRevision:2,abilityId:power,hand:'left'});await service.drain();assert.equal((await store.read(1)).equippedAbilities.power,power);
  await service.mutate(c,'setAbilityFavorite',{operationId:'favorite-shout',expectedRevision:3,abilityId:shout,favorite:true});await service.drain();
  await service.mutate(c,'setHotkey',{operationId:'bind',expectedRevision:4,slot:3,favoriteId:'ability:'+shout});await service.drain();
  const result=await service.mutate(c,'activateHotkey',{operationId:'use',expectedRevision:5,slot:3});await service.drain();assert(result.ok);assert.equal((await store.read(1)).equippedAbilities.power,shout);
  assert((await service.mutate(c,'activateHotkey',{operationId:'use',expectedRevision:5,slot:3})).replayed);assert.equal((await store.read(1)).revision,6);
});
test('read denies forged ownership, client imports, stale revisions and unknown catalog entries',async t=>{
  const s=addMagic(makeState());s.knownSpells=s.knownSpells.slice(1);const {service}=fixture(t,{state:s});
  await assert.rejects(service.magicDetails(c,{itemId:'ability:'+abilities[0].key,expectedRevision:0}),e=>e.code==='ABILITY_NOT_KNOWN');
  await assert.rejects(service.magicSnapshot(c,{knownSpells:[abilities[0].key]}),e=>e.code==='INVALID_PAYLOAD');
  await assert.rejects(service.magicSnapshot(c,{expectedRevision:99}),e=>e.code==='REVISION_CONFLICT');
  await assert.rejects(service.magicSnapshot({actorId:0}),e=>e.code==='INVALID_PAYLOAD');
  service.runtime.authorize=async()=>false;await assert.rejects(service.magicSnapshot(c),e=>e.code==='FORBIDDEN');
});
test('magic paging obeys transport budget and fail-closes an incomplete trusted catalog',async t=>{
  const list=Array.from({length:75},(_,i)=>({key:'Preview.esm:'+i.toString(16).padStart(6,'0'),name:'Magia '+i,kind:'spell',school:'alteration',description:'x'.repeat(1500)})),s=makeState();s.knownSpells=list.map(r=>r.key);
  const {service}=fixture(t,{state:s,abilities:list});let page=await service.magicSnapshot(c),rows=[...page.items];assert(page.nextOffset!==null);assert(Buffer.byteLength(JSON.stringify(page))<=11500);
  while(page.nextOffset!==null){page=await service.magicSnapshot(c,{offset:page.nextOffset,expectedRevision:0});rows.push(...page.items);assert(Buffer.byteLength(JSON.stringify(page))<=11500);}assert.equal(rows.length,75);
  service.abilities.records.delete(list[0].key);await assert.rejects(service.magicSnapshot(c),e=>e.code==='ABILITY_UNAVAILABLE');
});
test('trusted host sync is gated, replay-safe, revision-locked, clears forgotten equipment and hotkeys atomically',async t=>{
  const {service,store}=fixture(t),sync=require('../server/trusted-magic.cjs').trustedMagic(service,{allowedSources:['game']});
  await service.mutate(c,'equipAbility',{operationId:'equip-forget',expectedRevision:0,abilityId:abilities[0].key,hand:'left'});await service.drain();
  await service.mutate(c,'setHotkey',{operationId:'bind-forget',expectedRevision:1,slot:1,favoriteId:'ability:'+abilities[0].key});await service.drain();
  const p={characterId:1,operationId:'forget',source:'game',expectedRevision:2,knownSpells:abilities.filter(r=>r.kind==='spell'&&r.key!==abilities[0].key).map(r=>r.key),activeEffects:[]};
  const result=await sync(p);assert(result.ok);assert.equal(result.status,'pending');await service.drain();assert((await sync(p)).replayed);
  const s=await store.read(1);assert.equal(s.revision,3);assert.equal(s.equippedAbilities.left,null);assert(!s.favoriteAbilities.includes(abilities[0].key));assert.equal(s.hotkeys[1],undefined);assert.deepEqual(s.activeEffects,[]);
  await assert.rejects(sync({...p,operationId:'forged',source:'cef'}),e=>e.code==='FORBIDDEN');
  assert.equal((await sync({...p,operationId:'stale'})).error.code,'REVISION_CONFLICT');
  assert.equal((await sync({...p,operationId:'bad-kind',expectedRevision:3,knownSpells:[abilities[5].key]})).error.code,'INVALID_PAYLOAD');assert.equal((await store.read(1)).revision,3);
  assert.equal((await sync({...p,operationId:'bad-effect',expectedRevision:3,activeEffects:[{id:'bad',name:'Bad',magnitude:Infinity,expiresAt:null}]})).error.code,'MAGIC_STATE_INVALID');assert.equal((await store.read(1)).revision,3);
});
test('two-hand magic occupies both hands and cannot leave a half-equipped spell when replaced by an item',async t=>{
  const two={key:'Preview.esm:001250',kind:'spell',school:'alteration',name:'Ritual',twoHanded:true},s=addMagic(makeState());s.knownSpells.push(two.key);
  const {service,store}=fixture(t,{state:s,abilities:[...abilities,two]});
  await service.mutate(c,'equipAbility',{operationId:'ritual',expectedRevision:0,abilityId:two.key,hand:'right'});await service.drain();assert.deepEqual((await store.read(1)).equippedAbilities,{left:two.key,right:two.key});
  await service.mutate(c,'equip',{operationId:'replace-ritual',expectedRevision:1,itemId:'sword',hand:'right'});await service.drain();assert.deepEqual((await store.read(1)).equippedAbilities,{left:null,right:null});
  await service.mutate(c,'equipAbility',{operationId:'ritual-again',expectedRevision:2,abilityId:two.key,hand:'left'});await service.drain();assert((await store.read(1)).items.every(r=>!r.equipped.includes('right')));
  await service.mutate(c,'unequipAbility',{operationId:'ritual-remove',expectedRevision:3,abilityId:two.key,hand:'left'});await service.drain();assert.deepEqual((await store.read(1)).equippedAbilities,{left:null,right:null});
});
