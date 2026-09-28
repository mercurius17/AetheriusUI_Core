(function () {
  'use strict';
  const ui = window.AetheriusUI;
  if (!ui || window.__aetheriusEchoFixture) return;
  window.__aetheriusEchoFixture = ui.registerModule({
    id: 'class',
    version: '0.1.0',
    sdkMin: '1.0.0',
    label: 'Fixture de eco',
    rootRoute: '/class',
    radialSlot: 1,
    mount: function (container, context) {
      const panel = document.createElement('section');
      panel.className = 'showcase-panel fixture-panel';
      const title = document.createElement('h2');
      title.textContent = 'Fixture de integração do Core';
      const description = document.createElement('p');
      description.textContent = 'Envia uma solicitação de eco para verificar correlação, sessão e retorno pelo servidor.';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fixture-action';
      button.textContent = 'ENVIAR ECO DE TESTE';
      const result = document.createElement('output');
      result.className = 'fixture-result';
      const onClick = function () {
        button.disabled = true;
        result.textContent = 'Aguardando resposta…';
        context.request('core', 'echo', { fixture: 'class-echo', sentAt: Date.now() })
          .then(function (value) { result.textContent = JSON.stringify(value); })
          .catch(function (error) { result.textContent = error.message; })
          .finally(function () { button.disabled = false; });
      };
      button.addEventListener('click', onClick);
      panel.append(title, description, button, result);
      container.appendChild(panel);
      return { unmount: function () { button.removeEventListener('click', onClick); panel.remove(); } };
    }
  });
}());
