'use strict';
const catalog = require('./catalog.json');
const reason = 'Catálogo vanilla de apresentação. Raça, sexo, aparência e nome aguardam autorização e persistência no servidor.';
/**
 * Register only on the existing authenticated Core router.
 * No player identity, gameplay changes or client-selected race is accepted.
 */
module.exports = function registerCharacterCatalog(router) {
  if (!router || typeof router.register !== 'function') throw new Error('Core router required.');
  const dispose = router.register('character', 'snapshot', (_context, payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length)
      throw new Error('Character snapshot accepts an empty payload only.');
    return {
      schemaVersion: 1, scope: catalog.scope, readOnly: true, readOnlyReason: reason,
      races: catalog.races.map(({ id, name, description }) => ({ id, name, description }))
    };
  });
  const unload = () => dispose();
  unload.navigation = Object.freeze({ id: 'character', available: true, reason });
  return unload;
};
