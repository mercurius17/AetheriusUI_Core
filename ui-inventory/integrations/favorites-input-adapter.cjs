'use strict';
/** Explicit host contract, NOT an existing SkyMP or CommonLib API.
 * The host must consume the mapped Favorites control before vanilla handles it,
 * including remapped keys, and arbitrate conflicts with gameplay number keys.
 */
function bindFavoritesInput(host){
  for(const name of ['registerExclusiveControl','registerExclusiveKey','canOpen','showMainView','executeMainView','activateHotkey'])if(typeof host?.[name]!=='function')throw new Error('Missing exclusive input host.'+name);
  const dispose=[];
  try{
    dispose.push(host.registerExclusiveControl('Favorites',event=>{
      if(!event.isDown||event.repeat||event.cefFocused||!host.canOpen())return false;
      // Show/focus the EXISTING Core MainView; never create a second CEF view.
      host.showMainView(()=>host.executeMainView('window.AetheriusInventory.openFavorites()'));
      return true;
    }));
    for(let slot=1;slot<=9;slot++)dispose.push(host.registerExclusiveKey(String(slot),event=>{
      if(!event.isDown||event.repeat||event.cefFocused||!host.canOpen())return false;
      host.activateHotkey(slot); // Authenticated server request, fresh revision/opId.
      return true;
    }));
  }catch(e){dispose.reverse().forEach(fn=>{if(typeof fn==='function')fn();});throw e;}
  if(dispose.some(fn=>typeof fn!=='function')){dispose.reverse().forEach(fn=>{if(typeof fn==='function')fn();});throw new Error('Host must return shortcut disposers.');}
  return()=>dispose.splice(0).reverse().forEach(fn=>fn());
}
module.exports={bindFavoritesInput};
