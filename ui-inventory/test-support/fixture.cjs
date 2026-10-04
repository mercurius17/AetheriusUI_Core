'use strict';
const {state}=require('../shared/contract.cjs');
// Synthetic catalog: NEVER installed or selected by production bootstrap.
const rows=[
  ['sword','Espada de aço','weapons',9,40,{damage:12,equip:{kind:'oneHand',slots:['right']}}],
  ['greatsword','Espada grande de aço','weapons',17,90,{damage:22,equip:{kind:'twoHand',slots:['left','right']}}],
  ['shield','Escudo de aço','apparel',12,60,{armor:24,equip:{kind:'shield',slots:['left']}}],
  ['armor','Armadura de aço','apparel',28,220,{armor:38,equip:{kind:'armor',slots:['body']}}],
  ['potion','Poção de cura','potions',.5,25,{effects:[{id:'heal',name:'Restaura 25 pontos de saúde'}]}],
  ['food','Pão fresco','food',.2,3,{effects:[{id:'food',name:'Restaura vigor'}]}],
  ['ingredient','Flor azul da montanha','ingredients',.1,2,{effects:[{id:'heal',name:'Restaurar saúde'},{id:'fortify',name:'Fortificar conjuração'}]}],
  ['book','Os caminhos de Tamriel','books',1,15,{bookText:'Os caminhos de Tamriel\n\nNas estradas do norte, o vento conta histórias.\nUm viajante leva consigo apenas o que pode carregar.'}],
  ['tome','Tomo de magia: Chamas','books',1,70,{spellKey:'Preview.esm:001234'}],
  ['scroll','Pergaminho de chamas','misc',.5,30,{equip:{kind:'scroll',slots:['right']}}],
  ['poison','Veneno de dano à saúde','potions',.5,30,{poison:true,poisonUses:1}],
  ['soul','Gema da alma menor','misc',.2,50,{soulGem:true,soul:2}],
  ['key','Chave da casa do viajante','keys',0,0,{}],
  ['arrow','Flecha de aço','weapons',0,2,{equip:{kind:'ammo',slots:['ammo']}}],
  ['staff','Cajado do viajante','weapons',8,110,{damage:0,equip:{kind:'staff',slots:['right']}}],
  ['jewel','Anel de prata','apparel',.25,60,{armor:0,equip:{kind:'armor',slots:['ring']}}],
];
const records=rows.map(([tag,name,category,weight,value,extra],index)=>({tag,key:`Preview.esm:${(index+1).toString(16).padStart(6,'0')}`,baseId:0x1000+index,name,category,weight,value,...extra}));
function makeState(characterId=1){const s=state(characterId);s.gold=1275;s.items=records.map((r,i)=>({id:r.tag,key:r.key,count:['potion','food','ingredient','arrow','sword'].includes(r.tag)?(r.tag==='arrow'?48:3):1,equipped:[],favorite:['sword','potion'].includes(r.tag),provenance:{source:'DEMONSTRAÇÃO'}}));s.items.find(i=>i.id==='staff').enchantment={key:'Preview.esm:000abc',name:'Chamas'};s.items.find(i=>i.id==='staff').maxCharge=100;s.items.find(i=>i.id==='staff').charge=20;return s;}
function runtime(store,{effects=new Set(['projection','consume','learnSpell','readEffect','abilityEquip','castScroll']),interaction=null,admin=false}={}) {
  const applied=new Set(),log=[];
  return {log,applied,soulCharges:{1:50,2:100,3:200,4:400,5:800},interactions:true,
    resolveActor:async context=>({actorId:context.actorId,characterId:context.actorId}),authorize:async(c,cap)=>cap!=='inventory.audit'||admin,
    supports:type=>effects.has(type),validateInteraction:async()=>interaction,
    applyDurable:async(key,effect)=>{if(applied.has(key))return;applied.add(key);log.push({key,effect});},
  };
}
module.exports={records,makeState,runtime};
