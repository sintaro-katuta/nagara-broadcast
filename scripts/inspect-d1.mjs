import {readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const databaseId='27cb398e-0c26-4740-804d-f6bd49f75764';
const tablesSql="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('episodes','accounts','d1_migrations') ORDER BY name";
const migrationsSql='SELECT name FROM d1_migrations ORDER BY name';

// Only fixed, read-only queries are accepted; database rows and API errors are not logged.
export async function inspectD1({accountId,token,fetcher=fetch,files}){
 if(!/^[a-f0-9]{32}$/i.test(accountId||'')||!token)throw new Error('Cloudflare account ID or D1 read token is missing.');
 const endpoint=`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
 async function query(sql){
  const response=await fetcher(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({sql}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`D1 inspection failed (HTTP ${response.status}); check the D1 Read permission and account.`);
  const data=await response.json();if(!data.success||!Array.isArray(data.result?.[0]?.results))throw new Error('D1 inspection returned an invalid response.');
  return data.result[0].results.map(row=>row.name).filter(name=>typeof name==='string');
 }
 const tables=await query(tablesSql);
 const applied=tables.includes('d1_migrations')?await query(migrationsSql):[];
 const known=new Set(files.filter(name=>/^\d{4}_[\w-]+\.sql$/.test(name)));
 return {episodes:tables.includes('episodes'),accounts:tables.includes('accounts'),ledger:tables.includes('d1_migrations'),applied:applied.filter(x=>known.has(x)).sort(),pending:[...known].filter(x=>!applied.includes(x)).sort(),unknownCount:applied.filter(x=>!known.has(x)).length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const result=await inspectD1({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_D1_READ_TOKEN,files:await readdir(new URL('../cloudflare/migrations/',import.meta.url))});
  console.log(JSON.stringify(result,null,2));
  if(process.argv.includes('--require-complete')&&(!result.episodes||!result.accounts||!result.ledger||result.pending.length||result.unknownCount))throw new Error('Migration verification incomplete; investigate before enabling authentication.');
 }catch(error){console.error(error.message);process.exitCode=1;}
}
