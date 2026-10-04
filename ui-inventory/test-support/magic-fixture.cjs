'use strict';
// Synthetic identities and descriptions: never loaded by production bootstrap.
const abilities=[
  {key:'Preview.esm:001234',name:'Chamas',kind:'spell',school:'destruction',magickaCost:14,level:0,description:'Uma torrente de fogo que causa 8 pontos de dano por segundo.',effects:[{id:'flames',name:'Dano de fogo'}]},
  {key:'Preview.esm:001236',name:'Pele de carvalho',kind:'spell',school:'alteration',magickaCost:103,level:0,description:'Aumenta a proteção em 40 pontos por 60 segundos.'},
  {key:'Preview.esm:001237',name:'Invocar familiar',kind:'spell',school:'conjuration',magickaCost:107,level:0,description:'Invoca um familiar por 60 segundos.'},
  {key:'Preview.esm:001238',name:'Coragem',kind:'spell',school:'illusion',magickaCost:39,level:0,description:'O alvo não foge por 60 segundos e recebe saúde e vigor adicionais.'},
  {key:'Preview.esm:001239',name:'Cura',kind:'spell',school:'restoration',magickaCost:12,level:0,description:'Restaura 10 pontos de saúde por segundo.'},
  {key:'Preview.esm:001235',name:'Voz do norte',kind:'power',powerType:'greater',description:'Poder racial: demonstração do menu de poderes.'},
  {key:'Preview.esm:001240',name:'Força implacável',kind:'shout',cooldown:15,words:['Fus','Ro','Dah'],description:'Sua voz é uma força capaz de empurrar seus adversários.'},
];
function addMagic(s){
  s.knownSpells=abilities.filter(r=>r.kind==='spell').map(r=>r.key);s.knownPowers=abilities.filter(r=>r.kind==='power').map(r=>r.key);s.knownShouts=abilities.filter(r=>r.kind==='shout').map(r=>r.key);
  s.shoutWords={[s.knownShouts[0]]:2};s.favoriteAbilities=[s.knownSpells[0],...s.knownPowers];
  s.activeEffects=[{id:'oak-skin',name:'Pele de carvalho',magnitude:40,expiresAt:Date.now()+60000,description:'Proteção aumentada por uma magia de alteração.'},{id:'rested',name:'Descansado',magnitude:5,expiresAt:null,description:'Experiência de habilidades aumentada em 5%.'}];return s;
}
module.exports={abilities,addMagic};
