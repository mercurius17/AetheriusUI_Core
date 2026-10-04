(async function () {
  'use strict';
  const ui = window.AetheriusUI, config = window.AetheriusUIInstalledModules;
  if (!ui || !config || config.schemaVersion !== 1 || !Array.isArray(config.modules) || config.modules.length > 32) return;
  const ids = new Set();
  const catalog = new Map(ui.catalog.map(item => [item.id, item]));
  function loadAsset(file, stylesheet, owned) {
    return new Promise((resolve, reject) => {
      const node = document.createElement(stylesheet ? 'link' : 'script');
      if (stylesheet) { node.rel = 'stylesheet'; node.href = './' + file; }
      else { node.src = './' + file; node.async = false; }
      const timer = setTimeout(() => { node.remove(); reject(new Error('Tempo excedido ao carregar módulo.')); }, 10000);
      node.onload = () => { clearTimeout(timer); resolve(); };
      node.onerror = () => { clearTimeout(timer); reject(new Error('Asset local do módulo indisponível.')); };
      owned.push(node); document.head.appendChild(node);
    });
  }
  for (const entry of config.modules) {
    const owned = [];
    const registeredBefore = entry && ui.getRegisteredModuleIds().includes(entry.id);
    try {
      const destination = catalog.get(entry.id);
      if (!destination || ids.has(entry.id) || destination.slot !== entry.slot || destination.route !== entry.route || entry.sdkMajor !== 1) throw new Error('Manifesto de módulo incompatível.');
      ids.add(entry.id);
      if (!Array.isArray(entry.scripts) || !entry.scripts.length || !Array.isArray(entry.styles) || entry.scripts.length + entry.styles.length > 16) throw new Error('Lista de assets inválida.');
      const prefix = 'modules/' + entry.id + '/';
      for (const [files, extension] of [[entry.styles, '.css'], [entry.scripts, '.js']]) {
        for (const file of files) {
          if (typeof file !== 'string' || !file.startsWith(prefix) || !file.endsWith(extension) || !/^[a-zA-Z0-9_./-]+$/.test(file) || file.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Asset fora do módulo local.');
          await loadAsset(file, extension === '.css', owned);
        }
      }
      if (!ui.getRegisteredModuleIds().includes(entry.id)) throw new Error('O módulo não registrou seu adapter.');
    } catch (error) {
      if (!registeredBefore && owned.length && entry && typeof entry.id === 'string') await ui.unregisterModule(entry.id);
      owned.forEach(node => node.remove());
      console.warn('[AetheriusUI] Installed module failed', entry && entry.id, error.message);
    }
  }
}());
