'use strict';
// Development/integration tests only. Production uses the existing MySQL ledger.
const { DatabaseSync }=require('node:sqlite');
const crypto=require('node:crypto');
const {clone,fail}=require('../../shared/contract.cjs');
class SqliteTestStore {
  constructor(path=':memory:') {
    this.db=new DatabaseSync(path);this.tail=Promise.resolve();
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY,json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ops(owner INTEGER,id TEXT,hash TEXT,result TEXT,status TEXT,PRIMARY KEY(owner,id)); CREATE TABLE IF NOT EXISTS ledger(seq INTEGER PRIMARY KEY AUTOINCREMENT,json TEXT); CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,owner INTEGER,op TEXT,json TEXT,status TEXT,token TEXT,lease INTEGER DEFAULT 0);');
  }
  seed(s){this.db.prepare('INSERT INTO state(id,json) VALUES(?,?)').run(s.characterId,JSON.stringify(s));}
  async read(id){const r=this.db.prepare('SELECT json FROM state WHERE id=?').get(id);if(!r)fail('NOT_MIGRATED','Personagem não migrado.');return JSON.parse(r.json);}
  async transact(ids,op,fn){
    const run=this.tail.then(async()=>{
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const old=this.db.prepare('SELECT * FROM ops WHERE owner=? AND id=?').get(op.characterId,op.id);
        if(old){if(old.hash!==op.fingerprint)fail('IDEMPOTENCY_CONFLICT','Operação reutilizada.');this.db.exec('COMMIT');return{...JSON.parse(old.result),status:old.status,replayed:true};}
        const states=new Map();for(const id of [...new Set(ids)].sort((a,b)=>a-b))states.set(id,await this.read(id));
        const c=await fn(states);
        for(const id of c.touched)this.db.prepare('UPDATE state SET json=? WHERE id=?').run(JSON.stringify(c.states.get(id)),id);
        for(const e of c.events)this.db.prepare('INSERT INTO ledger(json) VALUES(?)').run(JSON.stringify({...e,operationId:op.id,correlationId:op.correlationId,source:op.source,at:new Date().toISOString()}));
        if(!c.result.ok)this.db.prepare('INSERT INTO ledger(json) VALUES(?)').run(JSON.stringify({characterId:op.characterId,operationId:op.id,action:op.action,rejected:true,error:c.result.error}));
        for(const e of c.effects)this.db.prepare('INSERT INTO outbox(id,owner,op,json,status) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),op.characterId,op.id,JSON.stringify(e),'pending');
        const status=c.result.ok?(c.effects.length?'pending':'applied'):'rejected';
        this.db.prepare('INSERT INTO ops(owner,id,hash,result,status) VALUES(?,?,?,?,?)').run(op.characterId,op.id,op.fingerprint,JSON.stringify(c.result),status);
        this.db.exec('COMMIT');return{...c.result,status};
      }catch(e){this.db.exec('ROLLBACK');throw e;}
    });this.tail=run.catch(()=>{});return run;
  }
  async operation(owner,id){const r=this.db.prepare('SELECT * FROM ops WHERE owner=? AND id=?').get(owner,id);return r?{...JSON.parse(r.result),status:r.status}:null;}
  async claim(){await this.tail;const r=this.db.prepare("SELECT * FROM outbox WHERE status='pending' OR (status='applying' AND lease<?) ORDER BY rowid LIMIT 1").get(Date.now());if(!r)return null;const token=crypto.randomUUID();this.db.prepare("UPDATE outbox SET status='applying',token=?,lease=? WHERE id=?").run(token,Date.now()+30000,r.id);return{id:r.id,characterId:r.owner,operationId:r.op,token,effect:JSON.parse(r.json)};}
  async finish(j,e){const result=this.db.prepare('UPDATE outbox SET status=? WHERE id=? AND token=?').run(e?'pending':'applied',j.id,j.token);if(!result.changes)return;const count=this.db.prepare("SELECT COUNT(*) n FROM outbox WHERE owner=? AND op=? AND status!='applied'").get(j.characterId,j.operationId).n;if(!count)this.db.prepare("UPDATE ops SET status='applied' WHERE owner=? AND id=?").run(j.characterId,j.operationId);}
  async audit(f={}){return this.db.prepare('SELECT seq,json FROM ledger ORDER BY seq').all().map(r=>({...JSON.parse(r.json),id:r.seq})).filter(r=>(!f.characterId||r.characterId===f.characterId)&&(!f.operationId||r.operationId===f.operationId)&&(!f.itemId||r.itemId===f.itemId)&&(!f.action||r.action===f.action)&&(!f.after||r.id>f.after)).slice(0,f.limit||40);}
  close(){this.db.close();}
}
module.exports={SqliteTestStore};
