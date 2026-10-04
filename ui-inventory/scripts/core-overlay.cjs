'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),core=require('./core-path.cjs');
const relative='referencias/repositories/aetherius-server/server/ts/systems/aetheriusUiSystem.ts';
let text=fs.readFileSync(path.join(core,relative),'utf8');
function replaceExact(before,after){if(text.split(before).length!==2)throw new Error('Upstream changed; re-audit overlay anchor: '+before.slice(0,90));text=text.replace(before,after);}
replaceExact('  private readonly router = new UiServerRouter();','  private readonly router = new UiServerRouter();\n  private readonly externalModules = new Set<string>();');
replaceExact('  initAsync(ctx: SystemContext): Promise<void> {',`  registerExternalModule(moduleId: string, register: (router: UiServerRouter) => () => void): () => void {
    if (!NAVIGATION_CATALOG.some(item => item.id === moduleId) || this.externalModules.has(moduleId)) throw new Error("Invalid or duplicate external module.");
    const dispose = register(this.router);
    if (!this.router.has(moduleId, "snapshot")) { dispose(); throw new Error("External module requires snapshot."); }
    this.externalModules.add(moduleId);
    let disposed = false;
    return () => { if (disposed) return; disposed = true; this.externalModules.delete(moduleId); dispose(); };
  }

  initAsync(ctx: SystemContext): Promise<void> {`);
replaceExact('return NAVIGATION_CATALOG.map((item) => ({ ...item, available: false, reason: "Módulo externo não registrado." }));','return NAVIGATION_CATALOG.map((item) => ({ ...item, available: this.externalModules.has(item.id), reason: this.externalModules.has(item.id) ? undefined : "Módulo externo não registrado." }));');
const output=path.join(root,'integrations','overlays','aetherius-server','server','ts','systems');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'aetheriusUiSystem.ts'),text);
console.log('Core registration overlay generated inside ui-inventory.');
