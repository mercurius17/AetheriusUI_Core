'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),core=require('./core-path.cjs');
function overlayClient(){
  const source=path.join(core,'referencias/repositories/aetherius-client/client/src/services/services/aetheriusUiService.ts');
  let text=fs.readFileSync(source,'utf8').replaceAll('\r\n','\n');
  function replace(before,after){if(text.split(before).length!==2)throw new Error('Client map overlay anchor changed: '+before);text=text.replace(before,after);}
  replace('import { Game } from "skyrimPlatform";', 'import { Game } from "skyrimPlatform";\nimport { NativeMapControl } from "./nativeMapControl";');
  replace('  private sessionId: string | null = null;', '  private sessionId: string | null = null;\n  private readonly nativeMap: NativeMapControl;');
  replace('    super();', '    super();\n    this.nativeMap = new NativeMapControl(this.sp, this.controller, packet => this.sendToView(packet), () => this.sessionId, () => this.controller.lookupListener(NetworkingService).isConnected());');
  replace('      const focused = event.strArg === "true";', '      const focused = event.strArg === "true";\n      this.nativeMap.onFocusChanged(focused);');
  replace('    if (!this.controller.lookupListener(NetworkingService).isConnected()) return;', '    if (!this.controller.lookupListener(NetworkingService).isConnected()) return;\n    if (this.nativeMap.handle(envelope)) return;');
  replace('      this.sessionId = content.sessionId;', '      this.nativeMap.reset();\n      this.sessionId = content.sessionId;');
  replace('  private resetSession() {', '  private resetSession() {\n    this.nativeMap.reset();');
  const out=path.join(root,'integrations/overlays/aetherius-client/client/src/services/services');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'aetheriusUiService.ts'),text);fs.copyFileSync(path.join(root,'integrations/client/nativeMapControl.ts'),path.join(out,'nativeMapControl.ts'));
  return out;
}
if(require.main===module)console.log('Client map overlay:',overlayClient());
module.exports={overlayClient};
