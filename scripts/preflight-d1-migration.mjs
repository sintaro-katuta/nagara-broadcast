import {pathToFileURL} from 'node:url';
import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const expectedTables=['accounts','favorites','listening_history','account_sessions','account_admins','passkeys','passkey_challenges','recovery_emails','passkey_login_attempts','recovery_tokens','auth_rate_limits','passkey_registration_attempts','passkey_enrollments','passkey_recovery_attempts','account_auth_generations','position_write_cursors','recovery_notice_outbox','account_deletion_attempts','d1_migrations'];
const expectedIndexes=['history_by_account_time','account_sessions_expiry','passkeys_account','passkey_login_attempts_expiry','recovery_tokens_account','recovery_tokens_expiry','auth_rate_limits_expiry','passkey_registration_attempts_expiry','passkey_enrollments_expiry','passkey_recovery_attempts_expiry','position_write_cursors_updated','passkey_challenges_expiry','recovery_notice_outbox_due','account_deletion_attempts_expiry'];
const databaseId='27cb398e-0c26-4740-804d-f6bd49f75764';
export async function checkMigrationFiles(){
 const dir=new URL('../cloudflare/migrations/',import.meta.url),files=(await readdir(dir)).filter(name=>name.endsWith('.sql')).sort(),hash=createHash('sha256');
 for(const file of files){hash.update(file);hash.update('\0');hash.update(await readFile(new URL(file,dir)));}
 if(files.length!==17||hash.digest('hex')!=='584d8192c0866bce081e491d82e5fb40799985f4f0225af275e7aa1709a8187b')throw new Error('Migration files changed; review and update this workflow before proceeding');
}
export async function preflight({accountId,token,fetcher=fetch}){
 if(!/^[a-f0-9]{32}$/i.test(accountId||'')||!token)throw new Error('D1 read configuration missing');
 const endpoint=`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
 async function query(sql){
  const response=await fetcher(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({sql}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`D1 preflight failed (HTTP ${response.status})`);
  const body=await response.json();if(!body.success||!Array.isArray(body.result?.[0]?.results))throw new Error('Invalid D1 preflight response');return body.result[0].results;
 }
 const tables=await query("SELECT name,type FROM sqlite_master WHERE type IN ('table','index','view','trigger')");
 const names=new Set(tables.map(row=>row.name));
 if(!tables.some(row=>row.name==='episodes'&&row.type==='table'))throw new Error('Episodes table is missing; stop and inspect the database');
 if([...expectedTables,...expectedIndexes].some(name=>names.has(name)))throw new Error('An authentication object or migration ledger already exists; stop and inspect the database');
 const columns=await query("PRAGMA table_info('episodes')");
 const id=columns.find(row=>row.name==='id');
 if(!id||id.pk!==1||!['title','channel','description','source','duration','size','date','object_key'].every(name=>columns.some(row=>row.name===name)))throw new Error('Episodes schema does not match; stop and inspect the database');
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await checkMigrationFiles();await preflight({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_D1_READ_TOKEN});console.log('Preflight passed: migration files match, episodes schema is present and authentication tables are absent.');}
 catch(error){console.error(error.message);process.exitCode=1;}
}
