'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const source=require('../scripts/frontend-overlay.cjs').overlay(path.join(require('../scripts/core-path.cjs'),'frontend/Data/MeridianUI/aetheriusui'));
const start=source.indexOf('  function openModule('),end=source.indexOf('  function animateWorkspaceElastic(',start);
function setup(){
  const log=[],modules=new Map([['inventory',{definition:{subroutes:['/inventory/favorites']}}],['spells',{definition:{subroutes:[]}}]]);
  const ctx={modules,NAV:[{id:'inventory',route:'/inventory'},{id:'spells',route:'/spells'}],state:{kind:'workspace',moduleId:'spells',route:'/spells'},transition:Promise.resolve(),window:{innerWidth:1920,innerHeight:1080},document:{querySelector:()=>null},isAvailable:()=>true,availabilityReason:()=>'',announce(){},routeIsSafe:(route,root)=>route===root||route.startsWith(root+'/'),navigate(route){log.push('navigate:'+route);},async unmountEntry(entry){assert.equal(entry,modules.get(ctx.state.moduleId));log.push('unmount');},setState(state){ctx.state=state;log.push('mount:'+state.moduleId+':'+state.route);},animateWorkspaceElastic:async()=>{log.push('animate');}};
  vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);return{ctx,log};
}
test('Core overlay cleans the previous workspace before opening compact favorites and reopening spells',async()=>{
  const {ctx,log}=setup();ctx.openModule('inventory','/inventory/favorites');await ctx.transition;assert.deepEqual(log,['unmount','mount:inventory:/inventory/favorites','animate']);
  ctx.openModule('spells');await ctx.transition;assert.equal(ctx.state.route,'/spells');assert.deepEqual(log.slice(3),['unmount','mount:spells:/spells','animate']);
});
test('same-module route does not remount and unknown subroutes cannot dispose the current menu',async()=>{
  const {ctx,log}=setup();ctx.state={kind:'workspace',moduleId:'inventory',route:'/inventory'};ctx.openModule('inventory','/inventory/favorites');await ctx.transition;assert.deepEqual(log,['navigate:/inventory/favorites']);
  assert.throws(()=>ctx.openModule('spells','/spells/forged'),/Rota não registrada/);assert.deepEqual(log,['navigate:/inventory/favorites']);
});
test('focus loss while cleanup is pending cannot resurrect a new workspace',async()=>{
  const {ctx,log}=setup();let release;ctx.unmountEntry=()=>new Promise(resolve=>{release=resolve;});ctx.openModule('inventory','/inventory/favorites');await new Promise(setImmediate);ctx.state={kind:'gameplay'};release();await ctx.transition;assert.deepEqual(log,[]);assert.equal(ctx.state.kind,'gameplay');
});
