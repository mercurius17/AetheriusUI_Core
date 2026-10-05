(function () {
  'use strict';
  const ui = window.AetheriusUI;
  if (!ui) throw new Error('PERSONAGEM requer Aetherius UI Core.');
  ui.registerModule({
    id: 'character', label: 'PERSONAGEM', version: '0.1.0',
    sdkMin: '1.0.0', sdkMaxExclusive: '2.0.0', rootRoute: '/character',
    subroutes: [], radialSlot: 0, capabilities: ['character.read'],
    assets: ['modules/character/character-module.js', 'modules/character/character-module.css', 'modules/character/race-catalog.js'],
    async mount(container, context) {
      container.classList.add('character-catalog');
      const status = document.createElement('p');
      status.setAttribute('role', 'status');
      status.textContent = 'Consultando o catálogo de raças…';
      container.replaceChildren(status);
      try {
        const response = await context.request('character', 'snapshot', {});
        if (context.signal.aborted) return;
        const snapshot = response.payload;
        if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.readOnly !== true ||
            !Array.isArray(snapshot.races) || snapshot.races.length > 128) throw new Error('Catálogo inválido.');
        const title = document.createElement('h2'); title.textContent = 'RAÇAS';
        const note = document.createElement('p');
        note.textContent = snapshot.readOnlyReason || 'Catálogo de apresentação; criação autoritativa pendente.';
        const grid = document.createElement('div'); grid.className = 'character-race-grid';
        const details = document.createElement('article');
        const name = document.createElement('h3'), description = document.createElement('p');
        details.append(name, description);
        const rows = snapshot.races.filter(row => row && typeof row.id === 'string' &&
          typeof row.name === 'string' && typeof row.description === 'string');
        const buttons = [];
        function inspect(row) {
          name.textContent = row.name.slice(0, 120);
          description.textContent = row.description.slice(0, 4000);
          buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.race === row.id)));
        }
        rows.forEach(row => {
          const button = document.createElement('button');
          button.type = 'button'; button.dataset.race = row.id;
          const illustration = (window.AetheriusRacePresentationCatalog || []).find(local => local.id === row.id);
          if (illustration && typeof illustration.icon === 'string') {
            const symbol = document.createElement('span');
            // Only bundled upstream artwork, never markup from the server.
            symbol.innerHTML = illustration.icon;
            button.append(symbol);
          }
          const label = document.createElement('span'); label.textContent = row.name.slice(0, 120); button.append(label);
          button.setAttribute('aria-pressed', 'false');
          button.addEventListener('click', () => inspect(row), { signal: context.signal });
          buttons.push(button); grid.append(button);
        });
        container.replaceChildren(title, note, grid, details);
        if (rows.length) inspect(rows[0]);
        else description.textContent = 'Nenhuma raça publicada pelo servidor.';
      } catch (_) {
        if (!context.signal.aborted) status.textContent = 'O servidor ainda não disponibilizou o catálogo de raças.';
      }
      return { unmount() { container.replaceChildren(); } };
    }
  });
}());
