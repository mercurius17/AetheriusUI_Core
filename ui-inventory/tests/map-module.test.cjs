'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(respond){
  let definition;const calls=[],focus=[],status={textContent:''},retry={hidden:false,addEventListener(){},removeEventListener(){}},container={innerHTML:'',querySelector:s=>s==='button'?retry:status};
  const request=async(moduleId,action,payload)=>{calls.push({moduleId,action,payload});return respond(action,payload);};
  const window={AetheriusUI:{registerModule:d=>(definition=d,()=>{}),request},aetheriusUiSetFocus:value=>focus.push(value)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui/map-module.js'),'utf8'),{window});
  const abort=new AbortController(),mount=definition.mount(container,{request,signal:abort.signal});
  const settle=async()=>{for(let n=0;n<5;n++)await new Promise(setImmediate);};return{definition,calls,focus,status,retry,container,abort,mount,settle};
}
test('radial MAPA slot 6 prepares and commits before releasing focus to the native game',async()=>{
  const h=fixture(action=>action==='prepareNative'?{ok:true,status:'prepared',ticket:'ticket'}:{ok:true,status:'releaseFocus'});await h.settle();assert.equal(h.definition.id,'map');assert.equal(h.definition.radialSlot,6);assert.equal(h.definition.rootRoute,'/map');assert.deepEqual(h.calls.map(r=>r.action),['prepareNative','openNative']);assert.deepEqual(h.focus,['false']);h.abort.abort();assert.equal(h.calls.length,2);
});
test('browser preview/native rejection keeps the radial workspace accessible and never releases focus',async()=>{
  const h=fixture(()=>({ok:false,error:{message:'Mapa disponível apenas no Skyrim.'}}));await h.settle();assert.equal(h.status.textContent,'Mapa disponível apenas no Skyrim.');assert.equal(h.retry.hidden,false);assert.deepEqual(h.focus,[]);assert(!h.container.innerHTML.includes('iframe'));h.mount.unmount();
});
test('leaving the module while preparation or commit is pending cancels the map instead of closing a different menu',async()=>{
  for(const phase of ['prepareNative','openNative']){
    let resolve;const h=fixture(action=>action===phase?new Promise(r=>resolve=r):action==='prepareNative'?{ok:true,status:'prepared',ticket:'ticket'}:{ok:true,status:'cancelled'});await h.settle();h.abort.abort();resolve(phase==='prepareNative'?{ok:true,status:'prepared',ticket:'ticket'}:{ok:true,status:'releaseFocus'});await h.settle();assert.deepEqual(h.focus,[]);assert(h.calls.some(r=>r.action==='cancelNative'&&r.payload.ticket==='ticket'));
  }
});
test('map metadata registration is independent of inventory write capabilities and never offers remote native commands',()=>{
  const handlers=new Map(),core={registerExternalModule:(id,register)=>{assert.equal(id,'map');return register({register:(moduleId,action,fn)=>{handlers.set(action,fn);return()=>handlers.delete(action);}});}};
  const unload=require('../integrations/register-native-map.cjs')(core);assert.equal(handlers.size,1);assert(handlers.has('snapshot'));assert(!handlers.has('openNative'));unload();assert.equal(handlers.size,0);
});
