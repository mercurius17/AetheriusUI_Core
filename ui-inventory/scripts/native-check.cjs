'use strict';
const path=require('node:path'),cp=require('node:child_process');
// MSBuild rejects an inherited environment containing both Path and PATH.
const clean=new Map();for(const [key,value] of Object.entries(process.env))clean.set(key.toUpperCase(),[key,value]);
const env=Object.fromEntries([...clean.values()]);
const root=path.resolve(__dirname,'..');
const p=cp.spawnSync('cmake',['-S',path.join(require('./core-path.cjs'),'native'),'-B',path.join(root,'.local','native-check-clean'),'-G','Visual Studio 18 2026','-A','x64','-DCMAKE_PREFIX_PATH=C:/dev/vcpkg/installed/x64-windows'],{env,encoding:'utf8'});
process.stdout.write(p.stdout||'');process.stderr.write(p.stderr||'');process.exitCode=p.status||0;
