'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const core=path.resolve(__dirname,'..'),test=path.resolve(process.argv[2]||'C:/Code/Aetherius-MP-Teste');
const repos={core,server:path.join(test,'repos/aetherius-server'),client:path.join(test,'repos/aetherius-client'),gameplay:path.resolve(core,'../referencias/AetheriusGameplayCore'),meridian:path.join(core,'referencias/repositories/MeridianUI')};
const output=path.join(test,'artifacts/source');fs.mkdirSync(output,{recursive:true});
const manifest={schemaVersion:1,created:new Date().toISOString(),repositories:{}};
for(const [id,repo] of Object.entries(repos)){
  const git=(...args)=>execFileSync('git',['-c','safe.directory='+repo.replaceAll('\\','/'),'-C',repo,...args],{maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']});
  const base=git('rev-parse','HEAD').toString().trim(),folder=path.join(output,id);
  fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'tracked.patch'),git('diff','--binary','HEAD','--'));
  const changed=git('diff','--name-only','-z','HEAD').toString().split('\0').filter(Boolean);
  const added=git('ls-files','--others','--exclude-standard','-z').toString().split('\0').filter(Boolean);
  const files=[];
  for(const relative of [...new Set([...changed,...added])]){
    if(relative.startsWith('.vscode/')||relative.startsWith('.agents/')||relative.startsWith('.codex/'))continue;
    if(relative.split('/').some(p=>p==='..')||path.isAbsolute(relative))throw Error('Unsafe source export');
    const source=path.join(repo,relative);if(!fs.existsSync(source)){files.push({path:relative,deleted:true});continue;}
    if(!fs.statSync(source).isFile())continue;
    const destination=path.join(folder,'files',relative),bytes=fs.readFileSync(source);
    fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);
    files.push({path:relative,added:added.includes(relative),size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  manifest.repositories[id]={source:repo,baseline:base,files};
}
fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(output,'README.txt'),'Source changes only; no upstream history or credentials. Clone each repository at its source-manifest baseline. Review/apply tracked.patch, then copy the files marked added from its files directory. Existing modified files are included for review/hash comparison. Build uses the prepared local configs described in Core/docs/BUILD_AND_DEPLOY.md. Historical patches in Core/integrations target other baselines.\n');
console.log(output);
