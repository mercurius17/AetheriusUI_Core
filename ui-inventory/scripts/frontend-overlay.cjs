'use strict';
const fs=require('node:fs'),path=require('node:path');
function overlay(core){
  let source=fs.readFileSync(path.join(core,'shell.js'),'utf8');
  const edits=[
    ['function openModule(id) {','function openModule(id, requestedRoute) {'],
    ["    transition = transition.then(async function () {\n      if (state.kind !== 'radial') return;", "    const route = requestedRoute || descriptor.route;\n    const entry = modules.get(id);\n    if (!routeIsSafe(route, descriptor.route) || (route !== descriptor.route && !entry?.definition.subroutes.includes(route))) throw new Error('Rota não registrada.');\n    transition = transition.then(async function () {\n      if (state.kind === 'workspace' && state.moduleId === id) { navigate(route); return; }\n      if (state.kind === 'workspace') {\n        const previousState = state;\n        await unmountEntry(modules.get(state.moduleId));\n        if (state !== previousState) return;\n      } else if (state.kind !== 'radial') return;"],
    ["setState({ kind: 'workspace', moduleId: id, route: descriptor.route });","setState({ kind: 'workspace', moduleId: id, route: route });"],
    ['    registerModule: registerModule,','    openModule: openModule,\n    registerModule: registerModule,']
  ];
  source=source.replaceAll('\r\n','\n');
  // Fail on an incompatible Core rather than silently packaging an unpatched host.
  for(const [before,after] of edits){if(source.split(before).length!==2)throw new Error('Core overlay anchor changed: '+before);source=source.replace(before,after);}
  return source;
}
module.exports={overlay};
