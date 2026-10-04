'use strict';
const { CATEGORIES, fail, integer, fingerprint, clone } = require('../shared/contract.cjs');
class Catalog {
  constructor(records, { pin, expectedPin } = {}) {
    if (!pin || pin !== expectedPin) fail('CATALOG_MISMATCH', 'Catálogo não corresponde ao pin autorizado pelo host.');
    this.pin = pin;
    this.records = new Map();
    for (const raw of records) {
      const row = clone(raw);
      if (typeof row.key !== 'string' || !/^[^/\\:]+\.(esm|esp|esl):[0-9a-f]{6}$/i.test(row.key)) fail('INVALID_CATALOG', 'Identidade estável inválida.');
      integer(row.baseId, 1, 0xffffffff);
      if (!CATEGORIES.includes(row.category) || typeof row.name !== 'string' || row.name.length > 160) fail('INVALID_CATALOG', 'Categoria/nome inválido.');
      for (const key of ['weight', 'value', 'damage', 'armor']) {
        if (row[key] !== undefined && (!Number.isFinite(row[key]) || row[key] < 0 || row[key] > 1e9)) fail('INVALID_CATALOG', 'Stat inválido.');
      }
      if (!Number.isFinite(row.weight) || !Number.isFinite(row.value) || row.baseId === 15) fail('INVALID_CATALOG', 'Peso/valor obrigatórios; Gold deve usar characters.gold.');
      if (row.equip && (!['oneHand', 'twoHand', 'shield', 'armor', 'ammo', 'scroll', 'staff'].includes(row.equip.kind) || !Array.isArray(row.equip.slots))) fail('INVALID_CATALOG', 'Equipamento inválido.');
      if (this.records.has(row.key) || [...this.records.values()].some(r => r.baseId === row.baseId)) fail('INVALID_CATALOG', 'Identidade duplicada.');
      this.records.set(row.key, Object.freeze(row));
    }
    this.hash = fingerprint([...this.records.values()]);
  }
  get(key) { const record = this.records.get(key); if (!record) fail('ITEM_UNSUPPORTED', 'Item não consta no catálogo verificado.'); return record; }
  byBaseId(id) { const row = [...this.records.values()].find(r => r.baseId === id); if (!row) fail('ITEM_UNSUPPORTED', 'Item legado não possui catálogo verificado.'); return row; }
}
module.exports = { Catalog };
