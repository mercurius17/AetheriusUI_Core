'use strict';
const {fail}=require('../shared/contract.cjs');
/** The supplied native adapter is OUR host contract, not a claimed SkyMP API. */
function createGamemodeRuntime({commands,admin,native,interactions,fence,soulCharges,combatMode='legacy'}) {
  if(typeof commands?.getActiveCharacterData!=='function'||typeof admin?.hasPermission!=='function')throw new Error('Bind the existing commands/admin modules.');
  if(!native||typeof native.applyOnce!=='function'||typeof native.supports!=='function')throw new Error('Durable gameplay adapter required; Papyrus ACK is insufficient.');
  return {
    interactions:!!interactions,soulCharges,
    async resolveActor(context) {
      const row=commands.getActiveCharacterData(context.actorId);
      return row?{actorId:context.actorId,characterId:row.characterId,accountId:row.accountId}:null;
    },
    async authorize(context,cap) {
      if(cap==='inventory.audit')return admin.hasPermission(context.actorId,'view_audit');
      if(cap==='inventory.write')return !!await fence?.verify?.();
      return cap==='inventory.read';
    },
    supports:type=>native.supports(type),
    verifyAuthorityFence:async()=>!!await fence?.verify?.(),
    async validateInteraction(actor,command,states) {
      if(!interactions?.validate)fail('FORBIDDEN','Interação autoritativa indisponível.');
      return interactions.validate(actor,command,states);
    },
    canEquip(actor,row,record,state) {
      if(combatMode==='aetherius'&&record.category==='weapons'&&state.items.some(i=>i.id!==row.id&&i.key===row.key&&i.equipped?.length))return false;
      return true;
    },
    async applyDurable(receipt,effect,catalog) {
      // applyOnce must persist receipt with the native effect, reject stale
      // projections by revision and update native Inventory AND Equipment.
      return native.applyOnce(receipt,effect,catalog);
    },
    previewToken:typeof native.previewToken==='function'?(...args)=>native.previewToken(...args):undefined,
  };
}
function projectInventory(state,catalog,resolveForm) {
  if(typeof resolveForm!=='function')throw new Error('Verified stable-form resolver required');
  return {entries:state.items.map(row=>{
    const r=catalog.get(row.key),equipped=row.equipped||[];
    const out={baseId:resolveForm(row.key,r.baseId),count:row.count,worn:equipped.includes('right')||equipped.some(s=>!['left','right'].includes(s)),wornLeft:equipped.includes('left')};
    if(row.name)out.name=row.name;
    if(row.refinement!==undefined)out.health=row.refinement;
    if(row.enchantment){if(!row.enchantment.key)throw new Error('Verified enchantment key required');out.enchantmentId=resolveForm(row.enchantment.key);out.maxCharge=row.maxCharge;out.chargePercent=row.charge;}
    if(row.soul!==undefined)out.soul=row.soul;
    if(row.poison){out.poisonId=resolveForm(row.poison.key);out.poisonCount=row.poison.remaining;}
    return out;
  })};
}
module.exports={createGamemodeRuntime,projectInventory};
