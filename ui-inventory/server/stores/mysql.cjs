'use strict';
const crypto = require('node:crypto');
const { clone, fail } = require('../../shared/contract.cjs');
class MySqlStore {
  constructor(db, catalog) {
    if (!db || typeof db.getConnection !== 'function' || typeof db.query !== 'function') throw new Error('MySQL database adapter required');
    this.db = db; this.catalog = catalog;
  }
  async read(characterId) {
    const rows = await this.db.query('SELECT s.state_json,c.gold FROM character_inventory_state s JOIN characters c ON c.id=s.character_id WHERE s.character_id=?', [characterId]);
    if (!rows.length) fail('NOT_MIGRATED', 'Personagem ainda não migrado.');
    const state = json(rows[0].state_json); state.gold = Number(rows[0].gold); return state;
  }
  async transact(characterIds, operation, execute) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();
      const states = new Map();
      for (const id of [...new Set(characterIds)].sort((a,b) => a-b)) {
        const [characters] = await conn.query('SELECT gold FROM characters WHERE id=? FOR UPDATE', [id]);
        if (!characters.length) fail('NOT_MIGRATED', 'Personagem não encontrado.');
        const [rows] = await conn.query('SELECT state_json FROM character_inventory_state WHERE character_id=? FOR UPDATE', [id]);
        if (!rows.length) fail('NOT_MIGRATED', 'Personagem ainda não migrado.');
        const s = json(rows[0].state_json); s.gold = Number(characters[0].gold); states.set(id, s);
      }
      const [existing] = await conn.query('SELECT fingerprint,result_json,status FROM inventory_operations WHERE character_id=? AND operation_id=?', [operation.characterId,operation.id]);
      if (existing.length) {
        if (existing[0].fingerprint !== operation.fingerprint) fail('IDEMPOTENCY_CONFLICT', 'Operação já usada com outro comando.');
        await conn.commit(); return { ...json(existing[0].result_json), status: existing[0].status, replayed: true };
      }
      const original = new Map([...states].map(([id,s]) => [id,clone(s)]));
      const change = await execute(new Map([...states].map(([id,s]) => [id,clone(s)])));
      let seq = 0;
      for (const id of change.touched) {
        const state = change.states.get(id), before = original.get(id);
        await conn.query('UPDATE character_inventory_state SET revision=?,state_json=? WHERE character_id=?', [state.revision,JSON.stringify(state),id]);
        await conn.query('UPDATE characters SET gold=? WHERE id=?', [state.gold,id]);
        await conn.query('DELETE FROM character_inventory WHERE character_id=?', [id]);
        const totals = new Map();
        for (const row of state.items) { const baseId=this.catalog.get(row.key).baseId; totals.set(baseId,(totals.get(baseId)||0)+row.count); }
        for (const [baseId,count] of totals) await conn.query('INSERT INTO character_inventory (character_id,base_id,count) VALUES (?,?,?)', [id,baseId,count]);
        const goldDelta=state.gold-before.gold;
        if (goldDelta) await conn.query("INSERT INTO gold_transactions (transaction_id,character_id,delta,reason,module,idempotency_key,status) VALUES (?,?,?,?,?,?,'committed')", [crypto.randomUUID(),id,goldDelta,operation.action,'ui-inventory',`${operation.id}:gold:${id}`]);
      }
      for (const event of change.events) {
        const baseId = this.catalog.get(event.key).baseId;
        await conn.query("INSERT INTO inventory_transactions (transaction_id,character_id,base_id,delta,reason,module,idempotency_key,status,operation_id,item_instance_id,details_json) VALUES (?,?,?,?,?,?,?,'committed',?,?,?)", [crypto.randomUUID(),event.characterId,baseId,event.delta,event.action,'ui-inventory',`${operation.id}:${operation.characterId}:${seq++}`,operation.id,event.itemId,JSON.stringify({...event,correlationId:operation.correlationId,actorId:operation.actorId,source:operation.source})]);
      }
      for (const effect of change.effects) {
        const id=crypto.randomUUID();
        await conn.query("INSERT INTO inventory_outbox (id,operation_id,character_id,effect_json,status) VALUES (?,?,?,?,'pending')", [id,operation.id,operation.characterId,JSON.stringify(effect)]);
      }
      const status = change.result.ok ? (change.effects.length ? 'pending' : 'applied') : 'rejected';
      await conn.query('INSERT INTO inventory_operations (character_id,operation_id,fingerprint,action,correlation_id,result_json,status) VALUES (?,?,?,?,?,?,?)', [operation.characterId,operation.id,operation.fingerprint,operation.action,operation.correlationId,JSON.stringify(change.result),status]);
      if (!change.result.ok) await conn.query('INSERT INTO inventory_alerts (character_id,operation_id,code,details_json) VALUES (?,?,?,?)', [operation.characterId,operation.id,change.result.error.code,JSON.stringify({action:operation.action,correlationId:operation.correlationId})]);
      await conn.commit(); return {...change.result,status};
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }
  async operation(characterId,id) {
    const rows=await this.db.query('SELECT result_json,status FROM inventory_operations WHERE character_id=? AND operation_id=?',[characterId,id]);
    return rows.length?{...json(rows[0].result_json),status:rows[0].status}:null;
  }
  async claim() {
    const conn=await this.db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows]=await conn.query("SELECT * FROM inventory_outbox WHERE (status='pending' AND available_at<=NOW(3)) OR (status='applying' AND lease_until<NOW(3)) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");
      if (!rows.length) { await conn.commit(); return null; }
      const row=rows[0],token=crypto.randomUUID();
      await conn.query("UPDATE inventory_outbox SET status='applying',lease_token=?,lease_until=DATE_ADD(NOW(3),INTERVAL 30 SECOND),attempts=attempts+1 WHERE id=?",[token,row.id]);
      await conn.commit(); return {id:row.id,operationId:row.operation_id,characterId:Number(row.character_id),token,effect:json(row.effect_json)};
    } catch(e) { await conn.rollback(); throw e; } finally {conn.release();}
  }
  async finish(job,error) {
    if(error) { await this.db.query("UPDATE inventory_outbox SET status='pending',last_error=?,available_at=DATE_ADD(NOW(3),INTERVAL 10 SECOND),lease_until=NULL WHERE id=? AND lease_token=? AND status='applying'",[String(error.code||'APPLY_FAILED').slice(0,64),job.id,job.token]); return; }
    await this.db.query("UPDATE inventory_outbox SET status='applied',last_error=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND status='applying'",[job.id,job.token]);
    await this.db.query("UPDATE inventory_operations o SET status='applied' WHERE character_id=? AND operation_id=? AND status='pending' AND NOT EXISTS (SELECT 1 FROM inventory_outbox b WHERE b.character_id=o.character_id AND b.operation_id=o.operation_id AND b.status<>'applied')",[job.characterId,job.operationId]);
  }
  async audit(filters) {
    const where=['module=?'],params=['ui-inventory'];
    for(const [field,column] of Object.entries({characterId:'character_id',operationId:'operation_id',itemId:'item_instance_id',action:'reason'})) if(filters[field]!==undefined) {where.push(`${column}=?`);params.push(filters[field]);}
    // Cursor is the legacy ledger id, verified in schema preflight; time filters use created_at.
    if(filters.after!==undefined){where.push('id>?');params.push(filters.after);}
    if(filters.from){where.push('created_at>=?');params.push(filters.from);}
    if(filters.to){where.push('created_at<=?');params.push(filters.to);}
    params.push(filters.limit||40);
    return this.db.query(`SELECT id,transaction_id,character_id,base_id,delta,reason,operation_id,item_instance_id,details_json,created_at FROM inventory_transactions WHERE ${where.join(' AND ')} ORDER BY id LIMIT ?`,params);
  }
}
function json(v){return typeof v==='string'?JSON.parse(v):clone(v);}
module.exports={MySqlStore};
