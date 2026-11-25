import {readdir,readFile} from 'node:fs/promises';

const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_WRITE_TOKEN,name='nagara-auth-preview';
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('D1 configuration missing');
const endpoint=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`;
async function request(path='',method='GET',body){
 const response=await fetch(endpoint+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>null);if(!response.ok||!data?.success)throw new Error(`Cloudflare request failed (HTTP ${response.status})`);return data.result;
}
const existing=await request('?per_page=100');
if(!Array.isArray(existing)||existing.some(db=>db.name===name))throw new Error('A database with the staging name already exists; inspect it before proceeding.');
let id,complete=false;
try{
 const result=await request('','POST',{name});
 if(result?.name!==name||!/^[-a-f0-9]{36}$/i.test(result?.uuid||'')||result.uuid==='27cb398e-0c26-4740-804d-f6bd49f75764')throw new Error('Unexpected staging database response');
 id=result.uuid;console.log(`Created empty test database ${name}: ${id}`);
 const dir=new URL('../cloudflare/migrations/',import.meta.url),files=(await readdir(dir)).filter(x=>x.endsWith('.sql')).sort();
 if(files.length!==17)throw new Error('Unexpected migration file count');
 for(const file of [new URL('../cloudflare/schema.sql',import.meta.url),...files.map(x=>new URL(x,dir))]){
  const result=await request(`/${id}/query`,'POST',{sql:await readFile(file,'utf8')});if(result.some(row=>row.success!==true))throw new Error('Test database initialization failed');
 }
 const check=await request(`/${id}/query`,'POST',{sql:'SELECT COUNT(*) AS n FROM episodes'});
 if(check?.[0]?.results?.[0]?.n!==0)throw new Error('Test database was not empty');
 complete=true;console.log('Base schema and 17 authentication migrations applied to the isolated database.');
}finally{
 if(id&&!complete){await request(`/${id}`,'DELETE');console.log('Incomplete test database removed.');}
}
