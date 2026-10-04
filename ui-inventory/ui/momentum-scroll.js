(function(root){
  'use strict';
  function step(velocity,dt){const decay=Math.exp(-8*dt);return{distance:velocity*(1-decay)/8,velocity:velocity*decay};}
  function impulse(velocity,delta){if(Math.sign(delta)!==Math.sign(velocity))velocity=0;return Math.max(-3600,Math.min(3600,velocity+delta*10));}
  function attach(container){
    let velocity=0,frame=0,previous=0,target=null;
    const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function stop(){cancelAnimationFrame(frame);frame=0;velocity=0;target=null;}
    function tick(now){
      if(!target?.isConnected){stop();return;}
      const dt=Math.min(.05,Math.max(.001,(now-previous)/1000));previous=now;
      const next=step(velocity,dt),before=target.scrollTop;target.scrollTop+=next.distance;velocity=next.velocity;
      if(Math.abs(velocity)<5||Math.abs(target.scrollTop-before)<.1){stop();return;}
      frame=requestAnimationFrame(tick);
    }
    function wheel(e){
      const el=e.target.closest('.inv-rows,.inv-item-card,.inv-book');
      if(!el||!container.contains(el)||el.scrollHeight<=el.clientHeight||e.ctrlKey)return;
      const delta=e.deltaY*(e.deltaMode===1?24:e.deltaMode===2?el.clientHeight:1);
      if(!delta)return;e.preventDefault();
      if(reduced()){stop();el.scrollTop+=delta;return;}
      if(target!==el)stop();target=el;velocity=impulse(velocity,delta);
      if(!frame){previous=performance.now();frame=requestAnimationFrame(tick);}
    }
    container.addEventListener('wheel',wheel,{passive:false});
    return{stop,get moving(){return !!frame;},dispose(){stop();container.removeEventListener('wheel',wheel);}};
  }
  const api={step,impulse,attach};if(typeof module==='object')module.exports=api;else root.AetheriusMomentumScroll=api;
})(typeof window==='undefined'?globalThis:window);
