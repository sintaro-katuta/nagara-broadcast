import {fileURLToPath,pathToFileURL} from 'node:url';

const productionDb='27cb398e-0c26-4740-804d-f6bd49f75764';
export function previewConfig({databaseId,origin,expiresAt,now=Date.now()}){
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId||'')||databaseId.toLowerCase()===productionDb)throw new Error('An isolated test database ID is required');
 let url;try{url=new URL(origin);}catch{throw new Error('Invalid preview origin');}
 if(url.protocol!=='https:'||url.origin!==origin||url.hostname!=='nagara-auth-staging.sintaro-katuta.workers.dev'||url.username||url.password)throw new Error('Invalid preview origin');
 const expires=Number(expiresAt),current=Math.floor(now/1000);
 if(!Number.isSafeInteger(expires)||expires<=current||expires>current+86400)throw new Error('Preview expiry must be within 24 hours');
 return {
  name:'nagara-auth-staging',main:fileURLToPath(new URL('../cloudflare/staging-worker.mjs',import.meta.url)),compatibility_date:'2026-10-20',
  assets:{directory:fileURLToPath(new URL('../cloudflare/public/',import.meta.url)),binding:'ASSETS',run_worker_first:true},
  d1_databases:[{binding:'DB',database_name:'nagara-auth-preview',database_id:databaseId}],vars:{PREVIEW_ONLY:'true',PREVIEW_EXPIRES_AT:String(expires),AUTH_ORIGIN:origin,AUTH_EMAIL_FROM:'no-reply@mail.nagara-broadcast.sintaro-katuta.com',AUTH_ENABLED:'true',PASSKEY_API_ENABLED:'true',PASSKEY_ADD_ENABLED:'true',ADMIN_BOOTSTRAP_ENABLED:'true',ADMIN_RECOVERY_ENABLED:'true',AUTH_NOTICES_ENABLED:'true'}
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(previewConfig({databaseId:process.env.PREVIEW_DATABASE_ID,origin:process.env.PREVIEW_ORIGIN,expiresAt:process.env.PREVIEW_EXPIRES_AT}),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
