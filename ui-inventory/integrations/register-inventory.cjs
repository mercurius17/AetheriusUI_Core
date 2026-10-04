'use strict';
const {createInventory}=require('../server/index.cjs');
const {preflight}=require('../scripts/migrate.cjs');
/** Called by the trusted host bootstrap with the existing UI System. */
module.exports=async function registerInventory(coreUiSystem,options) {
  if(typeof coreUiSystem?.registerExternalModule!=='function')throw new Error('Apply the Core public-registration overlay first.');
  if(!options.db)throw new Error('Pass the existing gamemode database adapter.');
  await preflight(options.db);
  if(typeof options.runtime?.verifyAuthorityFence!=='function'||!await options.runtime.verifyAuthorityFence())throw new Error('Production gate: legacy/native writers must be fenced and routed through inventory authority.');
  if(!options.runtime.supports('projection'))throw new Error('Production gate: durable server projection adapter missing.');
  const service=createInventory(options);
  const clean=[];
  try{
    clean.push(coreUiSystem.registerExternalModule('inventory',router=>service.register(router)));
    clean.push(coreUiSystem.registerExternalModule('spells',router=>service.registerSpells(router)));
    clean.push(require('./register-native-map.cjs')(coreUiSystem));
  }catch(e){clean.reverse().forEach(f=>f());throw e;}
  return {service,unload:()=>clean.splice(0).reverse().forEach(f=>f())};
};
