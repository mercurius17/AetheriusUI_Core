(function(){
  'use strict';
  // Explicit dev route. Never packaged into the production module.
  const sessionId='preview-local-session';
  document.getElementById('aetherius-shell').classList.add('is-preview');
  function deliver(packet){const encoded=new TextEncoder().encode(JSON.stringify(packet));let binary='';for(const b of encoded)binary+=String.fromCharCode(b);window.dispatchEvent(new CustomEvent('aetherius-ui-message',{detail:btoa(binary)}));}
  window.aetheriusUiSetFocus=function(value){window.AetheriusUI.nativeFocusChanged(JSON.parse(value));};
  window.aetheriusUiSend=async function(raw){
    const request=JSON.parse(raw);let payload;
    try{
      if(request.moduleId==='core')payload={revision:0,navigation:window.AetheriusUI.catalog.map(r=>({...r,available:['inventory','spells','map'].includes(r.id)})),demo:false};
      else if(request.moduleId==='map')payload={ok:false,error:{code:'PREVIEW_NATIVE_UNAVAILABLE',message:'O mapa nativo só está disponível dentro do Skyrim. Esta prévia não está conectada ao jogo.'}};
      else {const response=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({moduleId:request.moduleId,action:request.action,payload:request.payload})});payload=await response.json();}
    }catch(e){payload={ok:false,error:{code:'PREVIEW_FAILED',message:e.message}};}
    deliver({envelope:{protocolVersion:1,kind:'response',messageId:request.messageId+'-response',correlationId:request.correlationId,sessionId,moduleId:request.moduleId,payload}});
  };
  window.AetheriusInventoryInteraction={current:()=>null};
  deliver({type:'session',sessionId});
  deliver({envelope:{protocolVersion:1,kind:'snapshot',messageId:'preview-core',correlationId:'preview-core',sessionId,moduleId:'core',revision:0,payload:{navigation:window.AetheriusUI.catalog.map(r=>({...r,available:['inventory','spells','map'].includes(r.id)}))}}});
  window.AetheriusUI.nativeFocusChanged(true);
  window.addEventListener('load',()=>{
    const target=new URLSearchParams(window.location.search).get('menu');
    if(target==='spells')window.AetheriusUI.openModule('spells','/spells');
    else if(target==='map')window.AetheriusUI.openModule('map','/map');
    else if(target==='favorites')window.AetheriusInventory.openFavorites();
    else if(target==='inventory')window.AetheriusUI.openModule('inventory','/inventory');
  },{once:true});
})();
