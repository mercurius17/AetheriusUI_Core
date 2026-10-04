'use strict';
/** Native MAPA navigation metadata; map execution stays in the local client.
 * May be used independently of inventory's projection/write authority fence.
 */
module.exports=function registerNativeMap(coreUiSystem){
  if(typeof coreUiSystem?.registerExternalModule!=='function')throw new Error('Core public registration overlay required.');
  return coreUiSystem.registerExternalModule('map',router=>router.register('map','snapshot',async()=>({schemaVersion:1,revision:0,mode:'native',route:'/map',localControl:'Quick Map'})));
};
