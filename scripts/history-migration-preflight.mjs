import {readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {checkMigrationFiles} from './preflight-d1-migration.mjs';
const databaseId='27cb398e-0c26-4740-804d-f6bd49f75764',migration='0018_history_generations.sql';

// Only metadata and fixed schema queries are read. Never fetch account records.
export async function checkHistoryMigration({accountId,d1Token,workerToken,fetcher=fetch,verify=false}){
 if(!/^[a-f0-9]{32}$/i.test(accountId||'')||!d1Token||!workerToken)throw new Error('Cloudflare configuration missing');
 await checkMigrationFiles();
 const base=`https://api.cloudflare.com/client/v4/accounts/${accountId}`;
 async function request(path,token,options={}){const response=await fetcher(base+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});const data=await response.json().catch(()=>null);if(!response.ok||!data?.success)throw new Error(`Cloudflare inspection failed (${response.status})`);return data.result;}
 const db=await request(`/d1/database/${databaseId}`,d1Token);if(db.uuid!==databaseId||db.name!=='yorimichi-radio-db')throw new Error('Unexpected D1 database');
 const settings=await request('/workers/scripts/nagara-broadcast/settings',workerToken),bindings=settings?.bindings;
 if(!Array.isArray(bindings)||!['AUTH_ENABLED','PASSKEY_API_ENABLED'].every(name=>bindings.some(item=>item.name===name&&item.text==='false')))throw new Error('Production authentication must remain disabled');
 async function query(sql){const result=await request(`/d1/database/${databaseId}/query`,d1Token,{method:'POST',body:JSON.stringify({sql})});if(!Array.isArray(result?.[0]?.results))throw new Error('Invalid schema response');return result[0].results;}
 const tables=new Set((await query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('accounts','listening_history','position_write_cursors','account_history_generations','d1_migrations')")).map(row=>row.name));
 if(!['accounts','listening_history','position_write_cursors','d1_migrations'].every(name=>tables.has(name)))throw new Error('Required authentication tables missing');
 if(tables.has('account_history_generations')!==verify)throw new Error('History generation table is in an unexpected state');
 const columns=await query("PRAGMA table_info('accounts')");if(!columns.some(row=>row.name==='id'&&row.pk===1))throw new Error('Unexpected accounts schema');
 const files=(await readdir(new URL('../cloudflare/migrations/',import.meta.url))).filter(x=>/^\d{4}_[\w-]+\.sql$/.test(x)).sort();
 const applied=(await query('SELECT name FROM d1_migrations ORDER BY name')).map(row=>row.name).sort();
 const expected=verify?files:files.filter(name=>name!==migration);
 if(applied.length!==expected.length||applied.some((name,index)=>name!==expected[index]))throw new Error('Unexpected migration history; stop and inspect');
 if(verify){const historyColumns=await query("PRAGMA table_info('account_history_generations')");if(!historyColumns.some(x=>x.name==='account_id'&&x.pk===1)||!historyColumns.some(x=>x.name==='generation'&&x.notnull===1))throw new Error('Unexpected history generation schema');}
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await checkHistoryMigration({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,d1Token:process.env.CLOUDFLARE_D1_READ_TOKEN,workerToken:process.env.CLOUDFLARE_API_TOKEN,verify:process.argv.includes('--verify')});console.log(process.argv.includes('--verify')?'History migration verified; authentication remains disabled.':'Only migration 0018 is pending; authentication remains disabled.');}
 catch(error){console.error(error.message);process.exitCode=1;}
}
