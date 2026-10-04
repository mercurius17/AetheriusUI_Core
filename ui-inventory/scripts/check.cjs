'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
let count=0;
function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['dist','.local','node_modules','.git'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())visit(file);else if(/\.(cjs|js)$/.test(file)){cp.execFileSync(process.execPath,['--check',file],{stdio:'pipe'});count++;}}}
visit(root);console.log(`Syntax checks passed: ${count} files`);
