import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {checkHistoryMigration} from '../scripts/history-migration-preflight.mjs';

test('history migration preflight only accepts the expected schema, flags and ledger',async()=>{
 const files=(await readdir(new URL('../cloudflare/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort(),id='27cb398e-0c26-4740-804d-f6bd49f75764';
 const mock=({applied=files.slice(0,-1),history=false,enabled=false,wrongDatabase=false}={})=>async(url,options={})=>{
  if(url.endsWith('/settings'))return Response.json({success:true,result:{bindings:[{name:'AUTH_ENABLED',text:enabled?'true':'false'},{name:'PASSKEY_API_ENABLED',text:'false'}]}});
  if(url.endsWith(`/d1/database/${id}`))return Response.json({success:true,result:{uuid:id,name:wrongDatabase?'other':'yorimichi-radio-db'}});
  const sql=JSON.parse(options.body).sql;let rows;
  if(sql.startsWith('SELECT name FROM sqlite_master'))rows=['accounts','listening_history','position_write_cursors','d1_migrations',...(history?['account_history_generations']:[])].map(name=>({name}));
  else if(sql==="PRAGMA table_info('accounts')")rows=[{name:'id',pk:1}];
  else if(sql==="PRAGMA table_info('account_history_generations')")rows=[{name:'account_id',pk:1},{name:'generation',notnull:1}];
  else if(sql==='SELECT name FROM d1_migrations ORDER BY name')rows=applied.map(name=>({name}));else throw new Error('Unexpected query');
  return Response.json({success:true,result:[{results:rows}]});
 };
 const base={accountId:'a'.repeat(32),d1Token:'test',workerToken:'test'};
 assert.equal(await checkHistoryMigration({...base,fetcher:mock()}),true);
 assert.equal(await checkHistoryMigration({...base,fetcher:mock({applied:files,history:true}),verify:true}),true);
 for(const options of [{enabled:true},{wrongDatabase:true},{history:true},{applied:files},{applied:files.slice(0,-2)},{applied:[...files.slice(0,-1),'unknown.sql']}])await assert.rejects(checkHistoryMigration({...base,fetcher:mock(options)}));
 await assert.rejects(checkHistoryMigration({...base,fetcher:mock(),verify:true}));
});
