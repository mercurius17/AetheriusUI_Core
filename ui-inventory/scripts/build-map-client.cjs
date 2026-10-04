'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),client=path.join(require('./core-path.cjs'),'referencias/repositories/aetherius-client/client');
const webpack=require(path.join(client,'node_modules/webpack'));
const staged=path.join(root,'.local/map-client/referencias/repositories/aetherius-client/client');
const configPath=path.join(staged,'tsconfig.map-build.json'),config=JSON.parse(fs.readFileSync(path.join(client,'tsconfig.json'),'utf8'));
config.compilerOptions.paths={skyrimPlatform:[path.join(client,'node_modules/@skyrim-platform/skyrim-platform')]};fs.writeFileSync(configPath,JSON.stringify(config));
// Match the reference client's webpack target, output, loader and externals.
// Controller types are checked separately; transpileOnly keeps unrelated legacy
// declarations out of this isolated release build. No deploy/zip shell hooks.
const compiler=webpack({context:staged,target:'node',mode:'development',devtool:'inline-source-map',entry:'./src/index.ts',output:{path:path.join(root,'.local/map-client'),filename:'skymp5-client.js'},resolve:{extensions:['.ts','.tsx','.js','.jsx'],modules:[path.join(client,'node_modules'),'node_modules']},externals:{'@skyrim-platform/skyrim-platform':['skyrimPlatform'],skyrimPlatform:['skyrimPlatform']},module:{rules:[{test:/\.tsx?$/,loader:require.resolve(path.join(client,'node_modules/ts-loader')),options:{configFile:configPath,transpileOnly:true}}]}});
compiler.run((error,stats)=>compiler.close(closeError=>{
  if(error||closeError||stats?.hasErrors()){process.stderr.write(error?.stack||closeError?.stack||stats.toString({all:false,errors:true}));process.exitCode=1;return;}
  const warnings=stats.toString({all:false,warnings:true});if(warnings)process.stdout.write(warnings+'\n');
  console.log('Complete staged client built with webpack:',path.join(root,'.local/map-client/skymp5-client.js'));
}));
