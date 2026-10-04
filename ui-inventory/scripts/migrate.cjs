'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {state,integer,fail}=require('../shared/contract.cjs');
const {invariant}=require('../server/domain.cjs');
async function preflight(db) {
  const required={characters:['id','gold'],character_inventory:['character_id','base_id','count'],inventory_transactions:['id','transaction_id','character_id','base_id','delta','reason','module','idempotency_key','status','created_at'],gold_transactions:['transaction_id','character_id','delta','reason','module','idempotency_key','status']};
  for(const [table,fields] of Object.entries(required)) {
    const columns=await db.query('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
    const actual=new Set(columns.map(r=>r.COLUMN_NAME));
    if(fields.some(f=>!actual.has(f)))throw new Error(`Schema mismatch: ${table} requires ${fields.join(',')}`);
    const tables=await db.query('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
    if(tables[0]?.ENGINE!=='InnoDB')throw new Error(`${table} must use InnoDB`);
  }
  const duplicates=await db.query('SELECT character_id,base_id,COUNT(*) n FROM character_inventory GROUP BY character_id,base_id HAVING n>1 LIMIT 1');
  if(duplicates.length)throw new Error('Duplicate legacy balances: reconcile before migration');
  return {ok:true};
}
async function schema(db) {
  await preflight(db);
  const statements=fs.readFileSync(path.join(__dirname,'../migrations/001-inventory.sql'),'utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);
  for(const sql of statements) {
    const column=/ADD COLUMN (\w+)/.exec(sql);
    if(column){const exists=await db.query('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',['inventory_transactions',column[1]]);if(exists.length)continue;}
    const index=/CREATE INDEX (\w+)/.exec(sql);
    if(index){const exists=await db.query('SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?',['inventory_transactions',index[1]]);if(exists.length)continue;}
    await db.query(sql);
  }
}
async function migrateCharacter(db,catalog,characterId,{carryWeight,backup,legacyWritersStopped=false}={}) {
  integer(characterId,1);
  if(!legacyWritersStopped||typeof backup!=='function'||!Number.isFinite(carryWeight))fail('MIGRATION_GATE','Exige writers interrompidos, backup e capacidade autoritativa.');
  const conn=await db.getConnection();
  try{
    await conn.beginTransaction();
    const [characters]=await conn.query('SELECT gold FROM characters WHERE id=? FOR UPDATE',[characterId]);if(!characters.length)throw new Error('Character missing');
    const [existing]=await conn.query('SELECT character_id FROM character_inventory_state WHERE character_id=? FOR UPDATE',[characterId]);if(existing.length){await conn.commit();return{alreadyMigrated:true};}
    const [rows]=await conn.query('SELECT base_id,count FROM character_inventory WHERE character_id=? FOR UPDATE',[characterId]);
    await backup({characterId,gold:characters[0].gold,inventory:rows});
    const s=state(characterId);s.gold=integer(Number(characters[0].gold),0);s.carryWeight=carryWeight;
    for(const row of rows){
      const count=integer(Number(row.count),1),record=catalog.byBaseId(Number(row.base_id));
      // Never infer extras/quest status from a client inventory. Legacy balances
      // remain locked until a trusted migration review resolves this provenance.
      s.items.push({id:crypto.randomUUID(),key:record.key,count,equipped:[],favorite:false,locked:true,provenance:{source:'legacy-sql',reviewRequired:true}});
    }
    invariant(s,catalog);
    await conn.query('INSERT INTO character_inventory_state (character_id,revision,state_json) VALUES(?,?,?)',[characterId,s.revision,JSON.stringify(s)]);
    await conn.commit();return{migrated:true,lockedLegacyItems:s.items.length};
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
module.exports={preflight,schema,migrateCharacter};
