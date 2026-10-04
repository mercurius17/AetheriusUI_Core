(function () {
  'use strict';
  const root = document.getElementById('aetherius-hud');
  const allowedNeeds = new Set(['hunger', 'thirst', 'fatigue']);
  function render(event) {
    let payload;
    try {
      const binary = atob(event.detail);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (_) { return; }
    if (!payload || payload.type !== 'hud' || !payload.state || payload.source !== 'server') return;
    let visible = false;
    // TrueHUD exclusively owns health, magicka and stamina.
    const needs = payload.state.needs && typeof payload.state.needs === 'object' ? payload.state.needs : {};
    allowedNeeds.forEach(function (key) {
      const active = needs[key] === true;
      root.querySelector('[data-need="' + key + '"]').classList.toggle('is-visible', active);
      visible = visible || active;
    });
    root.classList.toggle('is-visible', visible);
    root.setAttribute('aria-hidden', String(!visible));
  }
  window.addEventListener('aetherius-hud-state', render);
  // The HUD has no input listener and stays hidden until an authoritative snapshot arrives.
}());
