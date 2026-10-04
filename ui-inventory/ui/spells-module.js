(function(){
  'use strict';
  const ui=window.AetheriusUI,views=window.AetheriusInventoryViews;
  if(!ui||!views)throw new Error('Feitiços requer o Core e a interface compartilhada do inventário.');
  window.unregisterAetheriusSpells=ui.registerModule({
    id:'spells',label:'FEITIÇOS',version:'0.3.0',sdkMin:'1.0.0',sdkMaxExclusive:'2.0.0',rootRoute:'/spells',subroutes:[],radialSlot:2,
    assets:['modules/inventory/sketch-icons.js','modules/inventory/momentum-scroll.js','modules/inventory/inventory-module.css','modules/inventory/preview-controller.js','modules/inventory/inventory-module.js','modules/inventory/spells-module.js'],
    capabilities:['inventory.read','inventory.write'],mount:views.mount
  });
})();
