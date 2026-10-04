'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
  let time=100000,session='map-session',connected=true,key=50,tweenKey=15,enabled=true;const events={},menus=new Set(),packets=[],taps=[],lookups=[];
  class Clock extends Date{static now(){return time;}}
  const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../.local/native-map.cjs'),'utf8'),{module,exports:module.exports,Date:Clock});
  const sp={Game:{getPlayer:()=>({is3DLoaded:()=>true}),isMenuControlsEnabled:()=>enabled},Ui:{isMenuOpen:menu=>menus.has(menu)},Input:{getMappedKey:(control,device)=>{lookups.push({control,device});return control==='Quick Map'?key:tweenKey;},tapKey:n=>taps.push(n)}};
  const control=new module.exports.NativeMapControl(sp,{on:(event,fn)=>events[event]=fn},p=>packets.push(p),()=>session,()=>connected);
  let sequence=0;
  const envelope=(action,payload={})=>({protocolVersion:1,kind:'request',sessionId:session,moduleId:'map',messageId:'m'+(++sequence),correlationId:'c'+sequence,action,payload});
  function request(action,payload={}){const e=envelope(action,payload);assert(control.handle(e));return{request:e,response:packets.at(-1).envelope.payload};}
  const prepare=()=>{control.onFocusChanged(true);const {response}=request('prepareNative');assert(response.ok);return response.ticket;};
  return{control,sp,events,menus,packets,taps,lookups,request,envelope,prepare,tick:()=>events.update(),setTime:value=>time=value,setConnected:value=>connected=value,setSession:value=>session=value,setKey:value=>key=value,setTweenKey:value=>tweenKey=value,setEnabled:value=>enabled=value};
}
test('native map uses remapped Quick Map after both CEF focus and Meridian focus menu release; taps only once',()=>{
  const h=fixture(),ticket=h.prepare();const committed=h.request('openNative',{ticket});assert.equal(committed.response.status,'releaseFocus');h.tick();assert.equal(h.taps.length,0);
  h.menus.add('MeridianUI_FocusMenu');h.control.onFocusChanged(false);h.tick();assert.equal(h.taps.length,0);
  h.menus.delete('MeridianUI_FocusMenu');h.setKey(77);h.tick();assert.deepEqual(h.taps,[77]);h.tick();assert.deepEqual(h.taps,[77]);assert(h.lookups.some(r=>r.control==='Quick Map'&&r.device===0));
  h.menus.add('MapMenu');h.events.menuOpen({name:'MapMenu'});assert.equal(h.packets.at(-1).envelope.payload.status,'opened');h.tick();assert.equal(h.taps.length,1);
});
test('cancellation, disconnection, session replacement and focus reclaim cannot open a stale map',()=>{
  for(const scenario of ['cancel','disconnect','session','focus']){
    const h=fixture(),ticket=h.prepare();h.request('openNative',{ticket});
    if(scenario==='cancel')h.request('cancelNative',{ticket});if(scenario==='disconnect')h.setConnected(false);if(scenario==='session')h.setSession('new-session');
    h.control.onFocusChanged(false);if(scenario==='focus')h.control.onFocusChanged(true);h.tick();assert.deepEqual(h.taps,[]);
  }
});
test('duplicate local envelopes neither prepare nor launch the map twice and cannot toggle an already open map closed',()=>{
  const h=fixture();h.control.onFocusChanged(true);const prepared=h.request('prepareNative');h.control.handle(prepared.request);
  const ticket=prepared.response.ticket,committed=h.request('openNative',{ticket});h.control.handle(committed.request);h.control.onFocusChanged(false);h.tick();h.control.handle(committed.request);h.tick();assert.equal(h.taps.length,1);
  h.menus.add('MapMenu');h.tick();assert.equal(h.packets.at(-1).envelope.payload.status,'opened');assert.equal(h.taps.length,1);
});
test('arbitrary keys/menus, unsupported actions, missing bindings and disabled gameplay menus are refused',()=>{
  for(const setup of [h=>h.menus.add('Loading Menu'),h=>h.setKey(-1),h=>h.setKey(255),h=>h.setKey(15),h=>{h.setKey(15);h.setTweenKey(90);},h=>{h.setKey(90);h.setTweenKey(90);},h=>h.setEnabled(false),h=>delete h.sp.Input.tapKey]){
    const h=fixture();setup(h);h.control.onFocusChanged(true);assert.equal(h.request('prepareNative').response.ok,false);h.control.onFocusChanged(false);h.tick();assert.equal(h.taps.length,0);
  }
  const h=fixture();h.control.onFocusChanged(true);assert.equal(h.request('prepareNative',{keycode:99}).response.ok,false);assert.equal(h.request('openMenu',{menu:'Console'}).response.ok,false);assert.equal(h.request('openNative',{ticket:'forged'}).response.ok,false);assert.equal(h.taps.length,0);
});
test('preparation does not launch on ordinary focus loss, and no success is reported before MapMenu opens',()=>{
  const h=fixture();h.prepare();h.control.onFocusChanged(false);h.tick();assert.equal(h.taps.length,0);h.setTime(106000);h.tick();assert.equal(h.packets.at(-1).envelope.payload.status,'failed');
  const pending=fixture(),ticket=pending.prepare();pending.request('openNative',{ticket});pending.control.onFocusChanged(false);pending.tick();assert.equal(pending.taps.length,1);pending.setTime(106000);pending.tick();assert.equal(pending.packets.at(-1).envelope.payload.status,'failed');assert(!pending.packets.some(p=>p.envelope.payload.status==='opened'));
});
test('patched real client intercepts map requests locally while inventory requests keep server transport',()=>{
  const listeners={},emitterListeners={},sent=[],modPackets=[],menus=new Set(),taps=[];
  const player={is3DLoaded:()=>true,sendModEvent:(name,payload)=>modPackets.push({name,packet:JSON.parse(payload)})};
  const sp={Game:{getPlayer:()=>player,isMenuControlsEnabled:()=>true},Ui:{isMenuOpen:menu=>menus.has(menu)},Input:{getMappedKey:c=>c==='Quick Map'?77:15,tapKey:k=>taps.push(k)},printConsole(){},on(){},once(){}};
  const module={exports:{}},sandbox={module,exports:module.exports,TextEncoder,console,require:name=>{assert.equal(name,'skyrimPlatform');return sp;}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../.local/map-client-service.cjs'),'utf8'),sandbox);
  const controller={on:(name,fn)=>{(listeners[name]||=[]).push(fn);},emitter:{on:(name,fn)=>emitterListeners[name]=fn,emit:(name,data)=>sent.push({name,data})},lookupListener:()=>({isConnected:()=>true})};
  new module.exports.AetheriusUiService(sp,controller);
  emitterListeners.customPacketMessage({message:{contentJsonDump:JSON.stringify({customPacketType:'aetherius-ui:v1:session',protocolVersion:1,sessionId:'map-session'})}});
  const emit=(name,event)=>listeners[name]?.forEach(fn=>fn(event));emit('modEvent',{eventName:'AetheriusUI.FocusState',strArg:'true'});
  function request(action,payload,moduleId='map'){emit('modEvent',{eventName:'AetheriusUI.FromView',strArg:JSON.stringify({protocolVersion:1,kind:'request',messageId:action,correlationId:action,sessionId:'map-session',moduleId,action,payload})});}
  request('prepareNative',{});const ticket=modPackets.at(-1).packet.envelope.payload.ticket;assert.equal(ticket,'prepareNative');request('openNative',{ticket});assert(!sent.some(r=>r.name==='sendMessage'));
  emit('modEvent',{eventName:'AetheriusUI.FocusState',strArg:'false'});emit('update');assert.deepEqual(taps,[77]);
  request('snapshot',{},'inventory');assert(sent.some(r=>r.name==='sendMessage'&&r.data.message.contentJsonDump.includes('inventory')));
});
