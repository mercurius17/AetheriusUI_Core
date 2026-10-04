'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const candidates=process.env.AETHERIUS_UI_CORE
  ? [path.resolve(process.env.AETHERIUS_UI_CORE)]
  : [path.resolve(root,'..'),path.resolve(root,'../AetheriusUI_Core')];
const core=candidates.find(candidate=>fs.existsSync(path.join(candidate,'shared/protocol.ts'))&&fs.existsSync(path.join(candidate,'frontend/Data/MeridianUI/aetheriusui/shell.js')));
if(!core)throw new Error('Aetherius UI Core checkout required. Set AETHERIUS_UI_CORE to its repository root.');
module.exports=core;
