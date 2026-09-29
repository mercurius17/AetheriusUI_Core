(function () {
  'use strict';
  const ui = window.AetheriusUI;
  if (!ui || window.__aetheriusServerPreviewFixture) return;
  window.__aetheriusServerPreviewFixture = ui.registerModule({
    id: 'server',
    version: '0.1.0',
    sdkMin: '1.0.0',
    label: 'Informações do servidor',
    rootRoute: '/server',
    radialSlot: 5,
    mount: function (container) {
      const emptyState = document.createElement('section');
      emptyState.className = 'ui-empty-state server-preview-empty';
      const title = document.createElement('h3');
      title.textContent = 'INFORMAÇÕES DO SERVIDOR';
      const description = document.createElement('p');
      description.textContent = 'Painel vazio para conferir a interface.';
      emptyState.append(title, description);
      container.appendChild(emptyState);
      return { unmount: function () { emptyState.remove(); } };
    }
  });
}());
