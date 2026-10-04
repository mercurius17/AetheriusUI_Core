'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),core=require('./core-path.cjs');
const source=path.join(core,'frontend','Data','MeridianUI','aetheriusui');
if(!fs.existsSync(path.join(source,'shell.js')))throw new Error('Aetherius UI Core checkout required.');
const output=path.join(root,'dist','meridian','Data','MeridianUI','aetheriusui');
fs.mkdirSync(output,{recursive:true});fs.cpSync(source,output,{recursive:true});
// Source font is locally licensed; exclude it from redistributable output.
const font=path.join(output,'fonts','futura-book-bt.ttf');if(fs.existsSync(font))fs.unlinkSync(font);
const modules=path.join(output,'modules','inventory');fs.mkdirSync(modules,{recursive:true});
const mapModule=path.join(output,'modules','map');fs.mkdirSync(mapModule,{recursive:true});fs.copyFileSync(path.join(root,'ui','map-module.js'),path.join(mapModule,'map-module.js'));
require('./client-overlay.cjs').overlayClient();
require('./client-regression.cjs');
for(const name of ['inventory-module.js','spells-module.js','inventory-module.css','preview-controller.js','sketch-icons.js','momentum-scroll.js'])fs.copyFileSync(path.join(root,'ui',name),path.join(modules,name));
let html=fs.readFileSync(path.join(output,'index.html'),'utf8');
html=html.replace('</head>','<link rel="stylesheet" href="./modules/inventory/inventory-module.css">\n</head>').replace('</body>','<script src="./modules/inventory/sketch-icons.js"></script>\n<script src="./modules/inventory/momentum-scroll.js"></script>\n<script src="./modules/inventory/preview-controller.js"></script>\n<script src="./modules/inventory/inventory-module.js"></script>\n<script src="./modules/inventory/spells-module.js"></script>\n<script src="./modules/map/map-module.js"></script>\n</body>');
fs.writeFileSync(path.join(output,'index.html'),html);
fs.writeFileSync(path.join(output,'shell.js'),require('./frontend-overlay.cjs').overlay(source));
const server=path.join(root,'dist','server-package');fs.mkdirSync(server,{recursive:true});
for(const name of ['server','shared','integrations','migrations','docs'])if(fs.existsSync(path.join(root,name)))fs.cpSync(path.join(root,name),path.join(server,name),{recursive:true});
fs.mkdirSync(path.join(server,'scripts'),{recursive:true});
fs.copyFileSync(path.join(root,'scripts','migrate.cjs'),path.join(server,'scripts','migrate.cjs'));
fs.copyFileSync(path.join(root,'README.md'),path.join(server,'README.md'));
const client=path.join(root,'dist','client-package','client','src','services','services');fs.mkdirSync(client,{recursive:true});
for(const name of ['aetheriusUiService.ts','nativeMapControl.ts'])fs.copyFileSync(path.join(root,'integrations/overlays/aetherius-client/client/src/services/services',name),path.join(client,name));
fs.copyFileSync(path.join(root,'docs','MAP.md'),path.join(root,'dist','client-package','README.md'));
const clientPlugin=path.join(root,'dist','client-package','Data','Platform','Plugins');fs.mkdirSync(clientPlugin,{recursive:true});
fs.copyFileSync(path.join(root,'.local','map-client','skymp5-client.js'),path.join(clientPlugin,'skymp5-client.js'));
for(const name of ['LICENSE','LICENSE.md']){const sourceLicense=path.join(core,'referencias','repositories','aetherius-client',name);if(fs.existsSync(sourceLicense))fs.copyFileSync(sourceLicense,path.join(root,'dist','client-package',name));}
const testStore=path.join(server,'server','stores','sqlite-test.cjs');if(fs.existsSync(testStore))fs.unlinkSync(testStore);
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else files.push({path:path.relative(path.join(root,'dist'),p).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')});}}
walk(output);walk(server);walk(path.join(root,'dist','client-package'));fs.writeFileSync(path.join(root,'dist','manifest.json'),JSON.stringify({version:require('../package.json').version,nativeIncluded:false,files},null,2));console.log('Package:',path.join(root,'dist'));
