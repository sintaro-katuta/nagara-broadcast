import {approveAdminRecovery} from '../cloudflare/admin-bootstrap.mjs';
import {pathToFileURL} from 'node:url';

const databaseId='27cb398e-0c26-4740-804d-f6bd49f75764';
export async function runAdminRecoveryApproval({account,d1Token,workerToken,accountCode,browserCode,fetcher=fetch}){
 if(!/^[a-f0-9]{32}$/i.test(account||'')||!d1Token||!workerToken||!/^[A-Za-z0-9_-]{22}$/.test(accountCode||'')||!/^[a-f0-9]{64}$/.test(browserCode||''))throw new Error('Invalid recovery approval input');
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
 async function request(path,token,options={}){const res=await fetcher(base+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});const body=await res.json().catch(()=>null);if(!res.ok||!body?.success)throw new Error(`Cloudflare request failed (${res.status})`);return body.result;}
 const database=await request(`/d1/database/${databaseId}`,d1Token);if(database.uuid!==databaseId||database.name!=='yorimichi-radio-db')throw new Error('Unexpected D1 database');
 const settings=await request('/workers/scripts/nagara-broadcast/settings',workerToken),bindings=settings?.bindings;
 if(!Array.isArray(bindings)||!['AUTH_ENABLED','PASSKEY_API_ENABLED','AUTH_NOTICES_ENABLED','ADMIN_RECOVERY_ENABLED'].every(name=>bindings.some(x=>x.name===name&&x.text==='true')))throw new Error('Administrator recovery is not enabled');
 async function query(sql,params=[]){const result=await request(`/d1/database/${databaseId}/query`,d1Token,{method:'POST',body:JSON.stringify({sql,params})});if(!Array.isArray(result?.[0]?.results))throw new Error('Invalid D1 response');return result[0].results;}
 const db={prepare(sql){return {async all(){return {results:await query(sql)}},bind(...params){return {async first(){return (await query(sql,params))[0]||null}}}}}};
 if(!await approveAdminRecovery(db,accountCode,browserCode))throw new Error('Recovery codes or request do not match');return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await runAdminRecoveryApproval({account:process.env.CLOUDFLARE_ACCOUNT_ID,d1Token:process.env.CLOUDFLARE_D1_WRITE_TOKEN,workerToken:process.env.CLOUDFLARE_API_TOKEN,accountCode:process.env.ADMIN_SETUP_CODE,browserCode:process.env.ADMIN_RECOVERY_CODE});console.log('The matching administrator recovery request was approved for five minutes.');}
 catch(error){console.error(error.message);process.exitCode=1;}
}
