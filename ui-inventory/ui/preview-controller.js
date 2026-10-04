(function(){
  'use strict';
  // Adapter contract is local-only; no model path or mouse motion is sent to server.
  // The current Core bridge does not implement this extension. Never fake Ready.
  class PreviewController {
    constructor(){this.area=null;this.token=null;this.yaw=35;this.pitch=15;this.distance=1;this.clean=[];this.generation=0;}
    get available(){return typeof window.AetheriusInventoryPreview?.show==='function';}
    hide(){this.generation++;this.clean.splice(0).forEach(f=>f());this.area=null;if(this.available)window.AetheriusInventoryPreview.hide();}
    mount(area,token){
      this.hide();this.area=area;this.token=token;const generation=this.generation;
      if(!this.available)return;
      const status=area.querySelector('[data-preview-status]');
      const resize=()=>{if(!area.isConnected)return this.hide();const r=area.getBoundingClientRect();window.AetheriusInventoryPreview.rect({x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight,pixelRatio:devicePixelRatio||1});};
      resize();
      Promise.resolve(window.AetheriusInventoryPreview.show(token)).then(result=>{if(generation!==this.generation)return;if(status)status.textContent=result?.ready?'Arraste para girar · scroll para zoom':result?.reason||'Modelo não suportado';if(result?.ready)area.classList.add('has-model');}).catch(()=>{if(generation===this.generation&&status)status.textContent='Falha ao carregar o modelo';});
      let dragging=false,px=0,py=0;
      const down=e=>{dragging=true;px=e.clientX;py=e.clientY;area.setPointerCapture?.(e.pointerId);};
      const move=e=>{if(!dragging)return;this.rotate((e.clientX-px)*.5,(e.clientY-py)*.5);px=e.clientX;py=e.clientY;};
      const up=()=>{dragging=false;};const wheel=e=>{e.preventDefault();this.zoom(Math.sign(e.deltaY)*.1);};
      for(const [name,fn] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['wheel',wheel]]){area.addEventListener(name,fn,{passive:false});this.clean.push(()=>area.removeEventListener(name,fn));}
      const observer=new ResizeObserver(resize);observer.observe(area);this.clean.push(()=>observer.disconnect());
      window.addEventListener('resize',resize);this.clean.push(()=>window.removeEventListener('resize',resize));
      this.camera();
    }
    camera(){if(this.available)window.AetheriusInventoryPreview.camera({yawDegrees:this.yaw,pitchDegrees:this.pitch,distanceScale:this.distance});}
    rotate(yaw,pitch){this.yaw=(this.yaw+yaw)%360;this.pitch=Math.max(-75,Math.min(75,this.pitch+pitch));this.camera();}
    zoom(change){this.distance=Math.max(.35,Math.min(3,this.distance+change));this.camera();}
    dispose(){this.hide();if(this.available)window.AetheriusInventoryPreview.clear();}
  }
  window.AetheriusInventoryPreviewController=PreviewController;
})();
