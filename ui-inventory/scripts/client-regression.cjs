'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),core=require('./core-path.cjs'),client=path.join(core,'referencias/repositories/aetherius-client/client');
const esbuild=require(path.join(core,'referencias/repositories/aetherius-server/server/node_modules/esbuild'));
const ts=require(path.join(client,'node_modules/typescript'));
const staged=path.join(root,'.local/map-client'),services=path.join(staged,'referencias/repositories/aetherius-client/client/src/services/services');
fs.mkdirSync(services,{recursive:true});fs.cpSync(path.join(core,'shared'),path.join(staged,'shared'),{recursive:true});
fs.cpSync(path.join(client,'src'),path.join(staged,'referencias/repositories/aetherius-client/client/src'),{recursive:true});
const overlay=require('./client-overlay.cjs').overlayClient();
for(const name of ['aetheriusUiService.ts','nativeMapControl.ts'])fs.copyFileSync(path.join(overlay,name),path.join(services,name));
const options={strict:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.NodeJs,baseUrl:client,paths:{skyrimPlatform:[path.join(client,'node_modules/@skyrim-platform/skyrim-platform')]},lib:['lib.es2020.d.ts','lib.dom.d.ts']};
const program=ts.createProgram([path.join(services,'nativeMapControl.ts')],options),diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));throw new Error('Native map TypeScript check failed');}
esbuild.buildSync({entryPoints:[path.join(services,'nativeMapControl.ts')],bundle:true,platform:'node',format:'cjs',target:'node18',outfile:path.join(root,'.local/native-map.cjs')});
// Compile the actual patched service. Resolve its existing dependencies in the
// reference checkout while keeping all writes in this module's staging area.
esbuild.buildSync({entryPoints:[path.join(services,'aetheriusUiService.ts')],bundle:true,platform:'node',format:'cjs',target:'node18',external:['skyrimPlatform'],alias:{'@skyrim-platform/skyrim-platform':'skyrimPlatform'},nodePaths:[path.join(client,'node_modules')],outfile:path.join(root,'.local/map-client-service.cjs')});
require('node:child_process').execFileSync(process.execPath,[path.join(root,'scripts/build-map-client.cjs')],{cwd:root,stdio:'inherit'});
console.log('Map controller type-checked; patched service and complete staged client entry bundled.');
