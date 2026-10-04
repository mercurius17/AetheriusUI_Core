(function () {
  'use strict';
  const pending = new Map();
  let sequence = 0, previewGeneration = 0;
  function send(action, payload) {
    if (typeof window.aetheriusUiVisual !== 'function') throw new Error('Apresentação nativa indisponível fora do Skyrim.');
    window.aetheriusUiVisual(JSON.stringify(Object.assign({ action: action }, payload)));
  }
  function request(action, payload, signal) {
    if (signal?.aborted) return Promise.reject(new Error('Abertura cancelada.'));
    const requestId = 'visual-' + Date.now().toString(36) + '-' + (++sequence);
    return new Promise(function (resolve, reject) {
      if (pending.size >= 16) { reject(new Error('Apresentação nativa ocupada.')); return; }
      function cleanup() { clearTimeout(timer); pending.delete(requestId); signal?.removeEventListener('abort', cancel); }
      function cancel() { cleanup(); if (action === 'mapOpen') { try { send('mapCancel', { requestId: requestId }); } catch (_) {} } reject(new Error('Abertura cancelada.')); }
      const timer = setTimeout(function () { cancel(); }, 8000);
      signal?.addEventListener('abort', cancel, { once: true });
      pending.set(requestId, { commit: function () { signal?.removeEventListener('abort', cancel); }, resolve: function (value) { cleanup(); resolve(value); }, reject: function (error) { cleanup(); reject(error); } });
      try { send(action, Object.assign({ requestId: requestId }, payload)); } catch (error) { cleanup(); reject(error); }
    });
  }
  window.addEventListener('aetherius-native-visual', function (event) {
    const value = event.detail;
    if (!value || typeof value.requestId !== 'string') return;
    const waiter = pending.get(value.requestId);
    if (!waiter) return;
    if (value.ok === true && value.status === 'committed') { waiter.commit(); return; }
    if (value.ok !== true) waiter.reject(new Error(value.reason || 'Apresentação nativa indisponível.'));
    else waiter.resolve(value);
  });
  window.AetheriusNativePresentation = Object.freeze({ openMap: function (signal) { return request('mapOpen', {}, signal); } });
  window.AetheriusInventoryPreview = Object.freeze({
    async show(token) {
      const generation = ++previewGeneration;
      let state = await request('previewShow', { token: token });
      for (let attempt = 0; state.status === 'loading' && attempt < 100; attempt++) {
        await new Promise(function (resolve) { setTimeout(resolve, 100); });
        if (generation !== previewGeneration) return { ready: false, reason: 'Seleção alterada.' };
        state = await request('previewStatus', { token: token });
      }
      return { ready: state.status === 'ready', reason: state.reason || (state.status === 'loading' ? 'Tempo de carregamento do modelo excedido.' : state.status === 'failed' ? 'Não foi possível renderizar este modelo.' : 'Modelo não suportado.') };
    },
    rect: function (rect) { send('previewRect', { rect: rect }); },
    camera: function (camera) { send('previewCamera', { camera: camera }); },
    hide: function () { previewGeneration++; if (typeof window.aetheriusUiVisual === 'function') send('previewHide', {}); },
    clear: function () { previewGeneration++; if (typeof window.aetheriusUiVisual === 'function') send('previewClear', {}); }
  });
}());
