'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createInventory}=require('../server/index.cjs'),{SqliteTestStore}=require('../server/stores/sqlite-test.cjs'),{records,makeState,runtime}=require('../test-support/fixture.cjs');
// Minimal DOM test double: validates intent, confirmation and lifecycle. This
// does not render CSS or substitute for visual/browser or in-game validation.
async function harness(t,favorites=false,options={}){
  const store=new SqliteTestStore();store.seed(options.state||makeState());t.after(()=>store.close());const service=createInventory({records,abilities:options.abilities||[],pin:'ui-test',expectedPin:'ui-test',store,runtime:runtime(store)});
  const listeners={},calls=[],classes=new Set(),focus=[];
  const shell={classList:{add:(...args)=>args.forEach(k=>classes.add(k)),remove:(...args)=>args.forEach(k=>classes.delete(k)),toggle:(k,b)=>b?classes.add(k):classes.delete(k)}};
  let definition,active=null,quantity=1;
  function element(dataset={}){return{dataset,disabled:false,tagName:'BUTTON',closest(){return this;},focus(){active=this;focus.push(dataset);},scrollIntoView(){}};}
  const container={innerHTML:'',classList:shell.classList,contains:()=>false,insertAdjacentHTML(_,html){this.innerHTML+=html;},querySelector(selector){
    if(selector==='[data-default-cancel]')return this.innerHTML.includes('data-default-cancel')?element({defaultCancel:true}):null;
    if(selector.includes('data-focus="quantity"'))return{value:String(quantity)};
    if(selector==='[aria-selected="true"]')return element();
    if(selector==='.inv-rows')return{scrollTop:0};
    return null;
  },querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners['container:'+name]=fn,removeEventListener:name=>delete listeners['container:'+name]};
  const opened=[],ui={registerModule:d=>(definition=d,()=>{}),getState:()=>({kind:'workspace',moduleId:options.moduleId||'inventory'}),openModule:(id,route)=>opened.push({id,route}),navigate:r=>listeners['window:aetherius-ui-route']?.({detail:r})};
  const win={AetheriusUI:ui,crypto:crypto.webcrypto,AetheriusSketchIcons:{icon:()=>'<svg/>',has:()=>false},AetheriusMomentumScroll:{attach:()=>({stop(){},dispose(){},moving:false})},AetheriusInventoryPreviewController:class{hide(){}dispose(){}},addEventListener:(name,fn)=>listeners['window:'+name]=fn,removeEventListener:name=>delete listeners['window:'+name]};
  const document={get activeElement(){return active;},getElementById:()=>shell};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui/inventory-module.js'),'utf8'),{window:win,document,queueMicrotask,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},Uint8Array,console});
  if(options.moduleId==='spells')vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui/spells-module.js'),'utf8'),{window:win});
  const abort=new AbortController();const mount=definition.mount(container,{moduleId:options.moduleId||'inventory',route:options.moduleId==='spells'?'/spells':favorites?'/inventory/favorites':'/inventory',signal:abort.signal,subscribe(){},async request(moduleId,action,payload){
    calls.push({action,payload});const c={actorId:1};
    if(action==='snapshot')return moduleId==='spells'?service.magicSnapshot(c,payload):service.snapshot(c,payload);
    if(action==='favoritesSnapshot')return service.favoritesSnapshot(c,payload);
    if(action==='itemDetails')return moduleId==='spells'?service.magicDetails(c,payload):service.details(c,payload);
    if(action==='operationStatus')return service.status(c,payload);
    await service.mutate(c,action,payload);await service.drain();return service.status(c,{operationId:payload.operationId});
  }});t.after(()=>mount.unmount());
  async function settle(){for(let i=0;i<8;i++)await new Promise(setImmediate);}
  await settle();
  return{store,service,container,calls,classes,focus,settle,win,mount,opened,definition,setQuantity:n=>quantity=n,
    equippedMark(id){return container.innerHTML.split(`data-select="${id}"`)[1]?.match(/class="inv-equipped-mark[^\"]*"[^>]*>([^<]*)<\/span>/)?.[1];},
    async key(key,extra={}){listeners['window:keydown']({key,target:{tagName:'BUTTON'},preventDefault(){},stopImmediatePropagation(){},...extra});await settle();},
    async hover(id){listeners['container:mouseover']({target:element({select:id})});await settle();},
    async click(id,button='left'){await listeners[button==='right'?'container:contextmenu':'container:click']({target:element({select:id}),preventDefault(){}});await settle();},
    async action(name,extra={}){await listeners['container:click']({target:element({action:name,...extra})});await settle();}
  };
}
test('R shows exact irreversible warning, defaults to No and cancellation sends no mutation',async t=>{
  const h=await harness(t,true);await h.hover('potion');await h.key('r');
  assert(h.container.innerHTML.includes('Você tem certeza que deseja descartar este item? Ele será destruído e não poderá ser obtido novamente.'));assert(h.focus.at(-1).defaultCancel);assert(h.container.innerHTML.includes('>Sim</button>'));assert(h.container.innerHTML.includes('>Não</button>'));
  await h.action('cancelModal');assert.equal((await h.store.read(1)).revision,0);assert(!h.calls.some(r=>r.action==='destroy'));
  await h.key('r');h.setQuantity(2);await h.action('confirmDestroy');assert.equal((await h.store.read(1)).items.find(r=>r.id==='potion').count,1);assert(h.calls.some(r=>r.action==='destroy'&&r.payload.confirmed&&r.payload.quantity===2));
});
test('spells mounts real radial slot 2, shows nine categories, filters schools and keeps active effects out of All',async t=>{
  const {abilities,addMagic}=require('../test-support/magic-fixture.cjs'),h=await harness(t,false,{moduleId:'spells',state:addMagic(makeState()),abilities});
  assert.equal(h.definition.id,'spells');assert.equal(h.definition.radialSlot,2);assert(h.classes.has('is-spells'));assert.equal((h.container.innerHTML.match(/data-category=/g)||[]).length,9);
  assert(!h.container.innerHTML.includes('data-select="effect:oak-skin"'));assert(h.container.innerHTML.includes('data-select="ability:'+abilities[0].key+'"'));
  await h.action('category',{category:'restoration'});assert(h.container.innerHTML.includes('data-select="ability:'+abilities[4].key+'"'));assert(!h.container.innerHTML.includes('data-select="ability:'+abilities[0].key+'"'));
  await h.action('category',{category:'activeEffects'});assert(h.container.innerHTML.includes('data-select="effect:oak-skin"'));assert(h.container.innerHTML.includes('SOMENTE CONSULTA'));
  const mutations=h.calls.filter(r=>['equipAbility','unequipAbility','setAbilityFavorite','destroy'].includes(r.action)).length;
  await h.click('effect:oak-skin');await h.key('e');await h.key('f');await h.key('r');await h.key('t');assert.equal(h.calls.filter(r=>['equipAbility','unequipAbility','setAbilityFavorite','destroy'].includes(r.action)).length,mutations);
  assert(!h.container.innerHTML.includes('Visualização 3D indisponível'));h.mount.unmount();assert(!h.classes.has('is-spells'));
});
test('spells hand toggles share favorites and hotkeys with inventory and Q opens compact favorites',async t=>{
  const {abilities,addMagic}=require('../test-support/magic-fixture.cjs'),h=await harness(t,false,{moduleId:'spells',state:addMagic(makeState()),abilities}),key=abilities[4].key;
  await h.click('ability:'+key,'right');assert.equal(h.equippedMark('ability:'+key),'L');
  await h.click('ability:'+key);assert.deepEqual((await h.store.read(1)).equippedAbilities,{left:key,right:key});assert.equal(h.equippedMark('ability:'+key),'L R');
  await h.click('ability:'+key);assert.equal((await h.store.read(1)).equippedAbilities.right,null);assert.equal(h.equippedMark('ability:'+key),'L');await h.key('f');
  const favorites=await h.service.favoritesSnapshot({actorId:1});assert(favorites.items.some(r=>r.abilityId===key));
  await h.service.mutate({actorId:1},'setHotkey',{operationId:'spell-hotkey',expectedRevision:favorites.revision,slot:9,favoriteId:'ability:'+key});await h.service.drain();
  await h.service.mutate({actorId:1},'activateHotkey',{operationId:'spell-use',expectedRevision:(await h.store.read(1)).revision,slot:9});await h.service.drain();assert.equal((await h.store.read(1)).equippedAbilities.right,key);
  await h.key('q');assert.deepEqual(h.opened.at(-1),{id:'inventory',route:'/inventory/favorites'});
});
test('hover plus digit maps exact favorite without use; digits do not map in inventory',async t=>{
  const h=await harness(t,true);await h.hover('potion');await h.key('9');assert.equal((await h.store.read(1)).hotkeys[9],'item:potion');assert.equal((await h.store.read(1)).items.find(r=>r.id==='potion').count,3);assert(h.container.innerHTML.includes('aria-label="Atalho 9"'));
  await h.key('9',{repeat:true});assert.equal(h.calls.filter(r=>r.action==='setHotkey').length,1);
  h.win.AetheriusUI.navigate('/inventory');await h.settle();await h.key('8');assert.equal(h.calls.filter(r=>r.action==='setHotkey').length,1);assert(!h.classes.has('is-favorites-workspace'));
});
test('left click equips right hand and right click equips left; E never consumes a potion',async t=>{
  const h=await harness(t);await h.click('sword');const right=h.calls.find(r=>r.action==='equip');assert.equal(right.payload.hand,'right');
  await h.click('staff','right');assert.equal(h.calls.filter(r=>r.action==='equip').at(-1).payload.hand,'left');
  await h.click('potion');await h.key('e');assert(!h.calls.some(r=>r.action==='consume'));assert.equal((await h.store.read(1)).items.find(r=>r.id==='potion').count,3);
  await h.click('staff','right');await h.key('t');assert(h.container.innerHTML.includes('aguarda o adaptador de encantamentos'));assert(!h.calls.some(r=>r.action==='recharge'));
});
test('F shares authoritative favorites and unmount removes compact menu listeners',async t=>{
  const h=await harness(t,true);await h.hover('potion');await h.key('1');await h.key('f');assert(!(await h.store.read(1)).items.find(r=>r.id==='potion').favorite);assert.equal((await h.store.read(1)).hotkeys[1],undefined);assert(!h.container.innerHTML.includes('data-select="potion"'));h.mount.unmount();assert(!h.classes.has('is-favorites-workspace'));assert(!h.classes.has('is-inventory-workspace'));
});
test('repeated mouse clicks toggle items in each hand in inventory and favorites without losing copies',async t=>{
  for(const favorites of [false,true]){
    const h=await harness(t,favorites);
    for(const [button,hand] of [['left','right'],['right','left']]){
      await h.click('sword',button);
      let s=await h.store.read(1);const equipped=s.items.find(r=>r.equipped.includes(hand));assert(equipped);
      await h.click(equipped.id,button);s=await h.store.read(1);
      assert(s.items.every(r=>!r.equipped.includes(hand)));assert.equal(s.items.filter(r=>r.id==='sword').length,1);
      assert.equal(s.items.filter(r=>r.key===equipped.key).reduce((n,r)=>n+r.count,0),3);
      assert.equal(h.calls.filter(r=>r.action==='unequip').at(-1).payload.hand,hand);
    }
    await h.click('sword');let s=await h.store.read(1);const equipped=s.items.find(r=>r.equipped.includes('right'));
    await h.key('e');s=await h.store.read(1);assert.deepEqual(s.items.find(r=>r.id===equipped.id).equipped,['right']);
  }
});
test('mouse toggles fixed-slot armor, shields, two-hand weapons and ammo using their canonical slots',async t=>{
  const h=await harness(t);
  for(const id of ['armor','shield','greatsword','arrow']){
    await h.click(id);let row=(await h.store.read(1)).items.find(r=>r.id===id);assert(row.equipped.length>0);const count=row.count;
    await h.click(id);row=(await h.store.read(1)).items.find(r=>r.id===id);assert.deepEqual(row.equipped,[]);assert.equal(row.count,count);assert.equal(h.calls.filter(r=>r.action==='unequip').at(-1).payload.hand,'auto');
  }
});
test('favorites mouse toggles spells by hand and powers by power slot without forgetting or unfavoriting',async t=>{
  const abilities=[{key:'Preview.esm:001234',name:'Chamas',kind:'spell'},{key:'Preview.esm:001235',name:'Voz do norte',kind:'power'}],state=makeState();state.knownSpells=[abilities[0].key];state.knownPowers=[abilities[1].key];state.favoriteAbilities=abilities.map(r=>r.key);
  const h=await harness(t,true,{state,abilities}),spell='ability:'+abilities[0].key,power='ability:'+abilities[1].key;
  await h.click(spell);assert.equal(h.equippedMark(spell),'R');await h.click(spell,'right');assert.deepEqual((await h.store.read(1)).equippedAbilities,{right:abilities[0].key,left:abilities[0].key});assert.equal(h.equippedMark(spell),'L R');
  await h.click(spell);let s=await h.store.read(1);assert.equal(s.equippedAbilities.right,null);assert.equal(s.equippedAbilities.left,abilities[0].key);assert.equal(h.equippedMark(spell),'L');
  await h.click(spell,'right');assert.equal(h.equippedMark(spell),'');await h.click(power);assert.equal((await h.store.read(1)).equippedAbilities.power,abilities[1].key);assert.equal(h.equippedMark(power),'›');
  await h.click(power,'right');s=await h.store.read(1);assert.equal(s.equippedAbilities.power,null);assert.equal(h.equippedMark(power),'');assert.deepEqual(s.knownSpells,state.knownSpells);assert.deepEqual(s.favoriteAbilities,state.favoriteAbilities);
});
