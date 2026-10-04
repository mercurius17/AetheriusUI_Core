'use strict';
const crypto = require('node:crypto');
const VERSION = 1;
const CATEGORIES = ['weapons', 'apparel', 'potions', 'food', 'ingredients', 'books', 'keys', 'misc'];
const ACTION_FIELDS = Object.freeze({
  equip: ['itemId', 'hand'], unequip: ['itemId', 'hand'], setFavorite: ['itemId', 'favorite'],
  consume: ['itemId'], read: ['itemId'], learnTome: ['itemId'], equipScroll: ['itemId', 'hand'],
  applyPoison: ['itemId', 'targetItemId'], recharge: ['itemId', 'targetItemId'],
  destroy: ['itemId', 'quantity', 'confirmed'], transfer: ['itemId', 'quantity', 'interactionId'],
  equipAbility: ['abilityId', 'hand'], unequipAbility: ['abilityId', 'hand'], setAbilityFavorite: ['abilityId', 'favorite'],
  setHotkey: ['favoriteId', 'slot'], activateHotkey: ['slot'],
  collect: ['worldItemId', 'interactionId'], castScroll: ['itemId', 'interactionId'],
});
class InventoryError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function fail(code, message) { throw new InventoryError(code, message); }
function integer(value, min = 0, max = 2_147_483_647) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_PAYLOAD', 'Quantidade ou revisão inválida.');
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(value)) fail('INVALID_PAYLOAD', 'Identificador inválido.');
  return value;
}
function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_PAYLOAD', 'Payload inválido.');
  if (Object.keys(value).some(key => !fields.includes(key))) fail('INVALID_PAYLOAD', 'Campo não permitido.');
  return value;
}
function command(action, payload) {
  const fields = ACTION_FIELDS[action];
  if (!fields) fail('ACTION_UNAVAILABLE', 'Ação indisponível.');
  object(payload, ['operationId', 'expectedRevision', ...fields]);
  identifier(payload.operationId); integer(payload.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
  for (const key of fields) {
    if (key === 'quantity') integer(payload[key], 1);
    else if (key === 'favorite') { if (typeof payload[key] !== 'boolean') fail('INVALID_PAYLOAD', 'Favorito inválido.'); }
    else if (key === 'confirmed') { if (payload[key] !== true) fail('CONFIRMATION_REQUIRED', 'Confirme a destruição do item.'); }
    else if (key === 'slot') integer(payload[key], 1, 9);
    else if (key === 'hand') { if (!['left', 'right', 'auto'].includes(payload[key])) fail('INVALID_PAYLOAD', 'Mão inválida.'); }
    else identifier(payload[key]);
  }
  return { action, ...payload };
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function fingerprint(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function bytes(value) { return Buffer.byteLength(JSON.stringify(value), 'utf8'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function state(characterId) { return { schemaVersion: VERSION, characterId, revision: 0, gold: 0, carryWeight: 300, items: [], knownSpells: [], knownEffects: {}, readBooks: [] }; }
module.exports = { VERSION, CATEGORIES, ACTION_FIELDS, InventoryError, fail, integer, identifier, object, command, canonical, fingerprint, bytes, clone, state };
