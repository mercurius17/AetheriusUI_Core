import { createHash } from "crypto";
import { UiServerRouter } from "../../vendor/aetherius-ui-core/sdk/server/router";

// A projection of native SERVER state. Never imports a browser inventory, grants
// abilities or registers a mutation. The transactional domain remains separate.
export function registerInventoryReadModel(router: UiServerRouter, host: Record<string, any>): () => void {
  const revisions = new Map<string, { digest: string; revision: number }>();
  const records = new Map<number, any>();
  const reason = "Consulta do servidor. Equipar, consumir e alterar itens aguardam a integração autoritativa.";
  function record(baseId: number): any {
    if (records.has(baseId)) return records.get(baseId);
    const source = host.lookupEspmRecordById(baseId)?.record;
    if (!source) throw new Error("Registro do item ausente na load order do servidor.");
    const fields = new Map<string, Buffer>((source.fields || []).map((field: any) => [field.type, Buffer.from(field.data)]));
    const full = fields.get("FULL");
    // LOCALIZED FULL is a string-table key, never UTF-8 text.
    // Lookup exposes child record flags, not the owning TES4 localization flag.
    // A four-byte FULL may be a table key; conservatively use EDID in that case.
    const name = full && full.length > 4 ? full.toString("utf8").replace(/\0.*$/, "").slice(0, 180) : source.editorId;
    const data = fields.get("DATA");
    const result: any = { name: name || source.editorId || `Form ${baseId.toString(16)}`, type: source.type, fields };
    if (data) {
      if (source.type === "WEAP" && data.length >= 10) { result.value = data.readUInt32LE(0); result.weight = data.readFloatLE(4); result.damage = data.readUInt16LE(8); }
      else if (["ARMO", "MISC", "INGR", "KEYM", "SLGM"].includes(source.type) && data.length >= 8) { result.value = data.readUInt32LE(0); result.weight = data.readFloatLE(4); }
      else if (source.type === "ALCH" && data.length >= 4) result.weight = data.readFloatLE(0);
      else if (source.type === "BOOK" && data.length >= 16) { result.value = data.readUInt32LE(8); result.weight = data.readFloatLE(12); }
    }
    for (const key of ["weight", "value", "damage"]) if (!Number.isFinite(result[key]) || result[key] < 0) delete result[key];
    if (records.size >= 512) records.delete(records.keys().next().value!);
    records.set(baseId, result);
    return result;
  }
  function project(actorId: number, magic: boolean): any {
    const raw = magic ? host.get(actorId, "knownSpells") : host.get(actorId, "inventory")?.entries;
    if (!Array.isArray(raw) || raw.length > 10000) throw new Error("Estado nativo de inventário inválido.");
    const items = raw.map((entry: any, index: number) => {
      const baseId = magic ? entry : entry.baseId;
      if (!Number.isSafeInteger(baseId) || baseId <= 0 || baseId > 0xffffffff || !magic && (!Number.isSafeInteger(entry.count) || entry.count < 1)) throw new Error("Item nativo inválido.");
      const meta = record(baseId), fields: Map<string, Buffer> = meta.fields;
      const category = magic ? "spells" : ({ WEAP: "weapons", ARMO: "apparel", ALCH: "potions", SCRL: "scrolls", INGR: "ingredients", BOOK: "books", KEYM: "keys" } as Record<string, string>)[meta.type] || "misc";
      const row: any = { id: `${magic ? "ability" : "native"}:${baseId.toString(16)}:${index}`, key: baseId.toString(16), name: magic ? meta.name : (entry.name || meta.name).slice(0, 180), category, count: magic ? 1 : entry.count, equipped: magic ? [] : [entry.worn ? "right" : null, entry.wornLeft ? "left" : null].filter(Boolean), favorite: false, effects: [], actions: [], equip: { kind: magic ? "spell" : meta.type === "WEAP" ? "oneHand" : meta.type === "SCRL" ? "scroll" : "item" }, ...(!magic ? { weight: meta.weight, value: meta.value, damage: meta.damage } : {}) };
      if (magic) {
        row.abilityId = row.id;
        const spit = fields.get("SPIT");
        if (spit && spit.length >= 12) {
          const type = spit.readUInt32LE(8);
          if (type === 2 || type === 3) { row.category = "powers"; row.equip.kind = "power"; }
          // Auto-cost depends on gameplay state; expose a fixed cost only.
          if (spit.readUInt32LE(4) & 1) row.magickaCost = spit.readUInt32LE(0);
        }
      }
      // Optional metadata must be omitted, not assigned undefined: the shared
      // protocol validates the DTO before JSON serialization drops undefined.
      for (const key of Object.keys(row)) if (row[key] === undefined) delete row[key];
      return row;
    });
    const key = `${actorId}:${magic}`, digest = createHash("sha256").update(JSON.stringify(items)).digest("hex"), old = revisions.get(key);
    const revision = old ? old.revision + Number(old.digest !== digest) : 0;
    if (revisions.size >= 4096 && !old) revisions.delete(revisions.keys().next().value!);
    revisions.set(key, { digest, revision });
    const allWeightsKnown = items.every((row: any) => Number.isFinite(row.weight));
    return { items, revision, summary: magic ? { known: items.length, total: items.length, activeEffects: null } : { total: items.length, gold: raw.filter((entry: any) => entry.baseId === 0xf).reduce((sum: number, entry: any) => sum + entry.count, 0), weight: allWeightsKnown ? items.reduce((sum: number, row: any) => sum + row.weight * row.count, 0) : null, carryWeight: null } };
  }
  function payloadObject(payload: unknown, allowed: string[]): any {
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some(key => !allowed.includes(key))) throw new Error("Solicitação de consulta inválida.");
    return payload;
  }
  const disposers: (() => void)[] = [];
  for (const moduleId of ["inventory", "spells"]) {
    const magic = moduleId === "spells";
    disposers.push(router.register(moduleId, "snapshot", (context, input) => {
      const payload = payloadObject(input, ["offset", "expectedRevision", "asOf"]), model = project(context.actorId, magic);
      const offset = payload.offset ?? 0;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > model.items.length || payload.expectedRevision !== undefined && payload.expectedRevision !== model.revision) throw new Error("Página desatualizada; atualize o menu.");
      const out: any = { schemaVersion: 1, revision: model.revision, catalogPin: "native-server-read-v1", hotkeys: {}, readOnlyReason: reason, summary: model.summary, offset, items: [], nextOffset: null, ...(magic ? { asOf: payload.asOf ?? Date.now() } : {}) };
      for (const item of model.items.slice(offset, offset + 30)) { if (Buffer.byteLength(JSON.stringify({ ...out, items: [...out.items, item] })) > 11000) break; out.items.push(item); }
      if (offset + out.items.length < model.items.length) out.nextOffset = offset + out.items.length;
      return out;
    }));
    disposers.push(router.register(moduleId, "itemDetails", (context, input) => {
      const payload = payloadObject(input, ["itemId", "expectedRevision"]), model = project(context.actorId, magic);
      if (payload.expectedRevision !== model.revision) throw new Error("Seleção desatualizada; atualize o menu.");
      const item = model.items.find((row: any) => row.id === payload.itemId);
      if (!item) throw new Error("Item não pertence ao personagem da sessão.");
      return { schemaVersion: 1, revision: model.revision, item, description: reason, previewToken: magic ? null : `native-preview:${item.key}` };
    }));
  }
  return () => { disposers.forEach(dispose => dispose()); revisions.clear(); records.clear(); };
}
