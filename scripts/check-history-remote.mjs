import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';
import {cleanupOldPositionCursors} from '../cloudflare/auth-cleanup.mjs';
import {adminBootstrapCode,bootstrapFirstAdmin} from '../cloudflare/admin-bootstrap.mjs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_WRITE_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('D1 test configuration missing');
const api=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`,name=`nagara-history-test-${randomUUID()}`;let id;
async function request(path='',method='GET',body){const response=await fetch(api+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const data=await response.json().catch(()=>null);if(!response.ok||!data?.success)throw new Error(`D1 request failed (${response.status})`);return data.result;}
async function sql(query,params=[]){const result=await request(`/${id}/query`,'POST',{sql:query,params});if(result[0]?.success!==true)throw new Error('D1 test query failed');return result[0];}
const db={prepare(query){return {query,params:[],bind(...params){return {...this,params}},async run(){return sql(this.query,this.params)},async first(){return (await this.run()).results?.[0]||null},async all(){return this.run()}}},async batch(statements){const result=await request(`/${id}/query`,'POST',{batch:statements.map(s=>({sql:s.query,params:s.params}))});if(result.some(x=>!x.success))throw new Error('D1 batch failed');return result;}};
try{
 const created=await request('','POST',{name});if(created?.name!==name||!/^[-a-f0-9]{36}$/i.test(created?.uuid||''))throw new Error('Unexpected temporary D1 response');id=created.uuid;
 const files=(await readdir(new URL('../cloudflare/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort();if(files.at(-1)!=='0018_history_generations.sql')throw new Error('Unexpected migrations');
 for(const path of [new URL('../cloudflare/schema.sql',import.meta.url),...files.slice(0,-1).map(x=>new URL('../cloudflare/migrations/'+x,import.meta.url))])await sql(await readFile(path,'utf8'));
 await sql("INSERT INTO accounts(id) VALUES ('synthetic-a'),('synthetic-b')");await sql("INSERT INTO episodes VALUES ('test-ep','test','tech','','',30,10,'2026-01-01','test/audio')");
 await sql("INSERT INTO listening_history VALUES ('synthetic-a','test-ep','2026-01-01',12)");
 await sql("INSERT INTO position_write_cursors VALUES ('synthetic-a','test-ep','old-writer-123456',1,'old-write','2026-01-01')");
 await sql(await readFile(new URL('../cloudflare/migrations/0018_history_generations.sql',import.meta.url),'utf8'));
 assert.equal((await sql('SELECT COUNT(*) AS n FROM listening_history')).results[0].n,1);assert.equal((await sql('SELECT COUNT(*) AS n FROM position_write_cursors')).results[0].n,1);
 const tokens=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')],hash=s=>createHash('sha256').update(s).digest('hex'),expires=Math.floor(Date.now()/1000)+600;
 for(let i=0;i<2;i++)await sql('INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES (?,?,?)',[hash(tokens[i]),i?'synthetic-b':'synthetic-a',expires]);
 const origin='https://radio.example',env={DB:db,AUTH_ENABLED:'true',PASSKEY_API_ENABLED:'false'};
 const apiRequest=(path,method,index,body,tag)=>worker.fetch(new Request(origin+path,{method,headers:{Origin:origin,Cookie:`__Host-nagara_session=${tokens[index]}`,...(tag?{'X-Account-Session':tag}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
 const read=async index=>{const res=await apiRequest('/api/account','GET',index);assert.equal(res.status,200);return res.json();};
 const body=(position,generation,sequence=1)=>({episodeId:'test-ep',positionSeconds:position,writerId:'test-writer-123456789',sequence,historyGeneration:generation});
 let a=await read(0),b=await read(1);assert.equal(a.historyGeneration,0);assert.equal(a.history[0].position_seconds,12);
 assert.equal((await apiRequest('/api/account/history','PUT',1,body(20,0),b.sessionTag)).status,200);
 assert.equal((await apiRequest('/api/account/history','DELETE',0,null,a.sessionTag)).status,200);
 assert.equal((await apiRequest('/api/account/history','PUT',0,body(8,0),a.sessionTag)).status,409);
 a=await read(0);b=await read(1);assert.equal(a.historyGeneration,1);assert.deepEqual(a.history,[]);assert.equal(b.history[0].position_seconds,20);
 assert.equal((await sql("SELECT COUNT(*) AS n FROM position_write_cursors WHERE account_id='synthetic-a'")).results[0].n,0);
 for(let i=0;i<8;i++){
  a=await read(0);const [write,clear]=await Promise.all([apiRequest('/api/account/history','PUT',0,body(15,a.historyGeneration,i+2),a.sessionTag),apiRequest('/api/account/history','DELETE',0,null,a.sessionTag)]);
  assert.ok([200,409].includes(write.status));assert.equal(clear.status,200);assert.deepEqual((await read(0)).history,[]);
  assert.equal((await sql("SELECT COUNT(*) AS n FROM position_write_cursors WHERE account_id='synthetic-a'")).results[0].n,0);
 }
 a=await read(0);assert.equal((await apiRequest('/api/account/history','PUT',0,body(25,a.historyGeneration,20),a.sessionTag)).status,200);assert.equal((await read(0)).history[0].position_seconds,25);
 assert.equal((await read(1)).history[0].position_seconds,20);
 await sql("UPDATE position_write_cursors SET updated_at='2020-01-01T00:00:00.000Z' WHERE account_id='synthetic-a'");
 a=await read(0);const priorGeneration=a.historyGeneration;assert.equal(await cleanupOldPositionCursors(db,Date.now()),1);
 assert.equal((await sql("SELECT COUNT(*) AS n FROM position_write_cursors WHERE account_id='synthetic-a'")).results[0].n,0);
 assert.equal((await read(0)).history[0].position_seconds,25);assert.equal((await read(0)).historyGeneration,priorGeneration+1);
 assert.equal((await apiRequest('/api/account/history','PUT',0,body(10,priorGeneration,21),a.sessionTag)).status,409);
 assert.equal((await read(1)).history[0].position_seconds,20);
 await sql("DELETE FROM accounts WHERE id='synthetic-a'");assert.equal((await sql("SELECT COUNT(*) AS n FROM account_history_generations WHERE account_id='synthetic-a'")).results[0].n,0);
 await sql("DELETE FROM accounts WHERE id='synthetic-b'");
 const adminId=randomUUID(),code=await adminBootstrapCode(adminId);await sql('INSERT INTO accounts(id) VALUES (?)',[adminId]);
 await sql('INSERT INTO recovery_emails VALUES (?,?,?,?)',[adminId,'synthetic-lookup','synthetic-cipher','2026-01-01']);
 await sql('INSERT INTO account_sessions VALUES (?,?,?)',[hash(randomBytes(32).toString('hex')),adminId,expires]);
 await sql('INSERT INTO passkeys VALUES (?,?,?,?,?,?)',['test-key-one',adminId,[1,2],0,'[]','2026-01-01']);
 assert.equal(await bootstrapFirstAdmin(db,code),false);
 await sql('INSERT INTO passkeys VALUES (?,?,?,?,?,?)',['test-key-two',adminId,[3,4],0,'[]','2026-01-01']);
 const bootstrap=await Promise.all([bootstrapFirstAdmin(db,code),bootstrapFirstAdmin(db,code)]);assert.deepEqual(bootstrap.sort(),[false,true]);
 assert.equal((await sql('SELECT COUNT(*) AS n FROM account_admins')).results[0].n,1);
 console.log('Temporary real D1: first-admin prerequisites and concurrent bootstrap verified.');
 console.log('Temporary real D1: migration preserved data, old writes rejected, concurrent clears safe, other account preserved and deletion cascaded.');
}finally{if(id){await request(`/${id}`,'DELETE');console.log('Temporary test database deleted');}}
