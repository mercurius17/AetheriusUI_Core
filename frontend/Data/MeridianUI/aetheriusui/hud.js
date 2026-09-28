(function () {
  'use strict';
  const root = document.getElementById('aetherius-hud');
  const allowedStats = new Set(['health', 'magicka', 'stamina']);
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
    const stats = payload.state.stats && typeof payload.state.stats === 'object' ? payload.state.stats : {};
    allowedStats.forEach(function (key) {
      const data = stats[key];
      const row = root.querySelector('[data-stat="' + key + '"]');
      const valid = data && Number.isFinite(data.current) && Number.isFinite(data.max) && data.max > 0;
      row.style.display = valid ? '' : 'none';
      if (!valid) return;
      visible = true;
      const fraction = Math.max(0, Math.min(1, data.current / data.max));
      row.querySelector('.hud-fill').style.width = (fraction * 100) + '%';
      row.querySelector('.hud-value').textContent = Math.round(data.current) + ' / ' + Math.round(data.max);
    });
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
