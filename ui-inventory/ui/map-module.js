(function () {
  'use strict';
  const ui = window.AetheriusUI;
  if (!ui) throw new Error('MAPA requer Aetherius UI Core.');
  window.unregisterAetheriusMap = ui.registerModule({
    id: 'map', label: 'MAPA', version: '0.3.2', sdkMin: '1.0.0', sdkMaxExclusive: '2.0.0', rootRoute: '/map', subroutes: [], radialSlot: 6,
    assets: ['modules/map/map-module.js'], capabilities: ['map.open'],
    async activate(context) {
      if (!window.AetheriusNativePresentation) throw new Error('A abertura do mapa está disponível dentro do Skyrim.');
      await window.AetheriusNativePresentation.openMap(context.signal);
    }
  });
}());
