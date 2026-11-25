import {randomUUID} from 'node:crypto';

// Runs only on a newly created test database, never the production database.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_WRITE_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('D1 test configuration missing');
const api=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`;
const name=`nagara-restore-test-${randomUUID()}`;
let id;
async function request(path='',method='GET',body){
 const response=await fetch(api+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data?.success)throw new Error(`Cloudflare request failed (${response.status})`);
 return data.result;
}
async function query(sql){const result=await request(`/${id}/query`,'POST',{sql});if(!result?.[0]?.success)throw new Error('Test query failed');return result[0].results;}
try{
 const created=await request('','POST',{name});
 if(created?.name!==name||!/^[-a-f0-9]{36}$/i.test(created?.uuid||'')||created.uuid==='27cb398e-0c26-4740-804d-f6bd49f75764')throw new Error('Unexpected test database response');
 id=created.uuid;console.log(`Created isolated test database: ${name}`);
 await query('CREATE TABLE restore_probe (value TEXT NOT NULL)');
 await query("INSERT INTO restore_probe VALUES ('before')");
 const {bookmark}=await request(`/${id}/time_travel/bookmark`);
 if(!bookmark||typeof bookmark!=='string')throw new Error('Bookmark not returned');
 await query("INSERT INTO restore_probe VALUES ('after')");
 await request(`/${id}/time_travel/restore?bookmark=${encodeURIComponent(bookmark)}`,'POST');
 const rows=await query('SELECT value FROM restore_probe ORDER BY value');
 if(rows.length!==1||rows[0].value!=='before')throw new Error('Restored contents did not match the bookmark');
 console.log('Isolated D1 bookmark and restore verified.');
}finally{
 if(id){await request(`/${id}`,'DELETE');console.log('Isolated test database deleted.');}
}
