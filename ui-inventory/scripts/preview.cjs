'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),core=path.join(require('./core-path.cjs'),'frontend','Data','MeridianUI','aetheriusui');
const {SqliteTestStore}=require('../server/stores/sqlite-test.cjs');
const {createInventory}=require('../server/index.cjs');const {records,makeState,runtime}=require('../test-support/fixture.cjs');
const {abilities,addMagic}=require('../test-support/magic-fixture.cjs');
const store=new SqliteTestStore();const seed=addMagic(makeState());seed.items.find(r=>r.id==='shield').favorite=true;store.seed(seed);const rt=runtime(store);
const service=createInventory({records,abilities,pin:'preview-only',expectedPin:'preview-only',store,runtime:rt});
rt.validateInteraction=async()=>null;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method==='POST'&&url.pathname==='/api/preview'){
      if(req.headers.origin!=='http://127.0.0.1:4177')throw new Error('Origin refused');
      let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>16000)throw new Error('Payload too large');body+=chunk;}
      const {moduleId='inventory',action,payload}=JSON.parse(body);let result;const context={actorId:1,userId:1,correlationId:'preview'};
      if(!['inventory','spells'].includes(moduleId))throw new Error('Module refused');
      if(moduleId==='spells'&&action==='snapshot')result=await service.magicSnapshot(context,payload);
      else if(moduleId==='spells'&&action==='itemDetails')result=await service.magicDetails(context,payload);
      else if(moduleId==='spells'&&!['equipAbility','unequipAbility','setAbilityFavorite','operationStatus'].includes(action))throw new Error('Spell action refused');
      else if(action==='favoritesSnapshot')result=await service.favoritesSnapshot(context,payload);
      else if(action==='snapshot')result=await service.snapshot(context,payload);
      else if(action==='itemDetails')result=await service.details(context,payload);
      else if(action==='operationStatus')result=await service.status(context,payload);
      else{result=await service.mutate(context,action,payload);await service.drain();result=await service.status(context,{operationId:payload.operationId});}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
    }
    if(url.pathname==='/shell.js'){res.setHeader('Content-Type',mime['.js']);res.end(require('./frontend-overlay.cjs').overlay(core));return;}
    let file;
    if(url.pathname==='/'){
      let html=fs.readFileSync(path.join(core,'index.html'),'utf8').replace('</head>','<link rel="stylesheet" href="/modules/inventory/inventory-module.css"></head>').replace('</body>','<script src="/preview/harness.js"></script><script src="/modules/inventory/sketch-icons.js"></script><script src="/modules/inventory/momentum-scroll.js"></script><script src="/modules/inventory/preview-controller.js"></script><script src="/modules/inventory/inventory-module.js"></script><script src="/modules/inventory/spells-module.js"></script><script src="/modules/map/map-module.js"></script></body>');
      html=html.replace('<body>','<body><div style="position:fixed;z-index:99;left:12px;top:8px;color:#e5b37e;font:12px Segoe UI">PRÉVIA · DADOS SINTÉTICOS · SEM CONEXÃO COM O JOGO</div>');
      res.setHeader('Content-Type',mime['.html']);res.end(html);return;
    }
    const harness=url.pathname==='/preview/harness.js',moduleAsset=url.pathname.startsWith('/modules/inventory/')||url.pathname.startsWith('/modules/map/');
    const base=moduleAsset?path.join(root,'ui'):harness?path.join(root,'preview'):core;
    const relative=moduleAsset?url.pathname.split('/').slice(3).join('/'):harness?'harness.js':url.pathname.slice(1);
    file=path.resolve(base,decodeURIComponent(relative));if(!file.startsWith(base+path.sep))throw new Error('Invalid path');
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
  }catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false,error:{code:e.code||'PREVIEW_ERROR',message:e.message}}));}
});server.listen(4177,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4177/'));
