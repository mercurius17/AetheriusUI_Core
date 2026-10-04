'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(respond){
  let definition;const calls=[];
  const window={AetheriusUI:{registerModule:d=>(definition=d,()=>{})},AetheriusNativePresentation:{openMap:async signal=>{calls.push(signal);return respond(signal);}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui/map-module.js'),'utf8'),{window});
  const abort=new AbortController(),errors=[],activation=definition.activate({signal:abort.signal}).catch(error=>errors.push(error.message));
  return{definition,calls,errors,abort,activation};
}
test('radial MAPA slot 6 delegates directly to the native visual API without a workspace',async()=>{
  const h=fixture(()=>({status:'opened'}));await h.activation;assert.equal(h.definition.id,'map');assert.equal(h.definition.radialSlot,6);assert.equal(h.definition.rootRoute,'/map');assert.equal(h.calls.length,1);assert.equal(h.calls[0],h.abort.signal);assert.equal(h.definition.mount,undefined);
});
test('browser preview/native rejection keeps the radial workspace accessible and never releases focus',async()=>{
  const h=fixture(()=>{throw new Error('Mapa disponível apenas no Skyrim.');});await h.activation;assert.deepEqual(h.errors,['Mapa disponível apenas no Skyrim.']);assert.equal(h.definition.mount,undefined);h.abort.abort();
});
test('pending native activation carries the lifecycle abort signal',async()=>{
  let seen;const h=fixture(signal=>new Promise(resolve=>{seen=signal;signal.addEventListener('abort',()=>resolve({status:'cancelled'}),{once:true});}));h.abort.abort();await h.activation;assert.equal(seen.aborted,true);
});
test('map metadata registration is independent of inventory write capabilities and never offers remote native commands',()=>{
  const handlers=new Map(),core={registerExternalModule:(id,register)=>{assert.equal(id,'map');return register({register:(moduleId,action,fn)=>{handlers.set(action,fn);return()=>handlers.delete(action);}});}};
  const unload=require('../integrations/register-native-map.cjs')(core);assert.equal(handlers.size,1);assert(handlers.has('snapshot'));assert(!handlers.has('openNative'));unload();assert.equal(handlers.size,0);
});
