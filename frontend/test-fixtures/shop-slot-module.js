(function () {
  'use strict';
  const ui = window.AetheriusUI;
  if (!ui || window.__aetheriusShopFixture) return;
  window.__aetheriusShopFixture = ui.registerModule({
    id: 'shop',
    version: '0.1.0',
    sdkMin: '1.0.0',
    label: 'Fixture vazia de slot',
    rootRoute: '/shop',
    radialSlot: 11,
    mount: function (container) {
      const panel = document.createElement('section');
      panel.className = 'showcase-panel fixture-panel';
      const title = document.createElement('h2');
      title.textContent = 'Slot de integração reservado';
      const note = document.createElement('p');
      note.textContent = 'Fixture vazia: não contém catálogo, preço, serviço, compra, apoiador, saldo ou persistência.';
      panel.append(title, note);
      container.appendChild(panel);
      return { unmount: function () { panel.remove(); } };
    }
  });
}());
