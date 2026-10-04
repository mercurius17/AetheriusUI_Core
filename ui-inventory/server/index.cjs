'use strict';
const {Catalog}=require('./catalog.cjs');
const {MySqlStore}=require('./stores/mysql.cjs');
const {InventoryService}=require('./service.cjs');
function createInventory({records,abilities=[],pin,expectedPin,db,store,runtime}) {
  const catalog=new Catalog(records,{pin,expectedPin});
  return new InventoryService({catalog,abilities,store:store||new MySqlStore(db,catalog),runtime});
}
module.exports={createInventory,Catalog,MySqlStore,InventoryService,trustedMagic:require('./trusted-magic.cjs').trustedMagic};
