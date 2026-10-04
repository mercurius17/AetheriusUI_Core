(function(){
  'use strict';
  const ui=window.AetheriusUI;if(!ui)throw new Error('MAPA requer Aetherius UI Core.');
  window.unregisterAetheriusMap=ui.registerModule({
    id:'map',label:'MAPA',version:'0.3.1',sdkMin:'1.0.0',sdkMaxExclusive:'2.0.0',rootRoute:'/map',subroutes:[],radialSlot:6,
    assets:['modules/map/map-module.js'],capabilities:['map.open'],
    mount(container,context){
      let disposed=false,busy=false,ticket=null,released=false;
      container.innerHTML='<section class="native-map-launch" aria-label="Mapa do jogo"><p role="status" aria-live="polite">Abrindo mapa…</p><button type="button">TENTAR NOVAMENTE</button></section>';
      const status=container.querySelector('[role="status"]'),retry=container.querySelector('button');
      async function request(action,payload){const result=await context.request('map',action,payload);if(result?.ok!==true)throw new Error(result?.error?.message||'O cliente não confirmou a solicitação de mapa.');return result;}
      function cancel(){if(ticket&&!released){const previous=ticket;ticket=null;ui.request('map','cancelNative',{ticket:previous}).catch(()=>{});}}
      async function open(){
        if(disposed||busy)return;busy=true;retry.hidden=true;status.textContent='Abrindo mapa…';
        try{
          if(typeof window.aetheriusUiSetFocus!=='function')throw new Error('A abertura do mapa está disponível dentro do Skyrim.');
          const prepared=await request('prepareNative',{});
          ticket=prepared.ticket;
          if(typeof ticket!=='string'||prepared.status!=='prepared')throw new Error('Resposta de preparação de mapa inválida.');
          if(disposed){cancel();return;}
          const committed=await request('openNative',{ticket});
          if(disposed){cancel();return;}
          if(committed.status!=='releaseFocus')throw new Error('O cliente não autorizou a troca de foco.');
          // The native FocusState(false) event confirms release to the client.
          released=true;try{window.aetheriusUiSetFocus('false');}catch(error){released=false;throw error;}
        }catch(error){cancel();if(!disposed){status.textContent=error.message;retry.hidden=false;}}
        finally{busy=false;}
      }
      function cleanup(){if(disposed)return;disposed=true;cancel();retry.removeEventListener('click',open);}
      retry.addEventListener('click',open);context.signal.addEventListener('abort',cleanup,{once:true});open();return{unmount:cleanup};
    }
  });
})();
