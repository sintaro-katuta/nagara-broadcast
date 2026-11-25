import {randomUUID,createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';

const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_WRITE_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('D1 test configuration missing');
const api=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`,apiFetch=globalThis.fetch.bind(globalThis),name=`nagara-auth-test-${randomUUID()}`;let id;
async function request(path='',method='GET',body){
 const response=await apiFetch(api+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data?.success)throw new Error(`Cloudflare request failed (${response.status}, code ${data?.errors?.[0]?.code||'unknown'})`);
 return data.result;
}
async function sql(sql,params=[]){const result=await request(`/${id}/query`,'POST',{sql,params});if(result.some(row=>row.success!==true))throw new Error('D1 statement failed');return result;}
const db={
 prepare(query){const statement={query,params:[],bind(...args){return {...this,params:args.map(x=>x instanceof Uint8Array?Array.from(x):x)}},async run(){return (await sql(this.query,this.params))[0]},async first(){return (await this.run()).results?.[0]||null},async all(){return this.run()}};return statement;},
 async batch(statements){const result=await request(`/${id}/query`,'POST',{batch:statements.map(s=>({sql:s.query,params:s.params}))});if(result.some(row=>row.success!==true))throw new Error('D1 batch failed');return result;}
};
function registration(options,id,key,origin){
 const jwk=key.export({format:'jwk'}),cose=Buffer.concat([Buffer.from('a5010203262001215820','hex'),Buffer.from(jwk.x,'base64url'),Buffer.from('225820','hex'),Buffer.from(jwk.y,'base64url')]);
 const auth=Buffer.concat([createHash('sha256').update('radio.example').digest(),Buffer.from([0x45,0,0,0,0]),Buffer.alloc(16),Buffer.from([0,id.length]),id,cose]);
 const attestation=Buffer.concat([Buffer.from('a363666d74646e6f6e656761747453746d74a068617574684461746158','hex'),Buffer.from([auth.length]),auth]);
 const client=Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.challenge,origin,crossOrigin:false}));
 return {id:id.toString('base64url'),rawId:id.toString('base64url'),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:client.toString('base64url'),attestationObject:attestation.toString('base64url'),transports:['internal']}};
}
function assertion(options,id,privateKey,origin){
 const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:options.challenge,origin,crossOrigin:false}));
 const auth=Buffer.concat([createHash('sha256').update('radio.example').digest(),Buffer.from([5,0,0,0,1])]);
 const signature=sign('sha256',Buffer.concat([auth,createHash('sha256').update(client).digest()]),privateKey);
 return {id:id.toString('base64url'),rawId:id.toString('base64url'),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:client.toString('base64url'),authenticatorData:auth.toString('base64url'),signature:signature.toString('base64url'),userHandle:null}};
}
try{
 const created=await request('','POST',{name});
 if(created?.name!==name||!/^[-a-f0-9]{36}$/i.test(created?.uuid||'')||created.uuid==='27cb398e-0c26-4740-804d-f6bd49f75764')throw new Error('Unexpected test database response');
 id=created.uuid;console.log(`Created isolated test database: ${name}`);
 const migrations=(await readdir(new URL('../cloudflare/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort();
 for(const path of [new URL('../cloudflare/schema.sql',import.meta.url),...migrations.map(file=>new URL('../cloudflare/migrations/'+file,import.meta.url))])await sql(await readFile(path,'utf8'));
 await sql("INSERT INTO episodes VALUES ('ep','title','tech','','',10,3,'2026-01-01','audio/ep')");
 const messages=[],origin='https://radio.example',env={DB:db,AUTH_ENABLED:'true',PASSKEY_API_ENABLED:'true',AUTH_NOTICES_ENABLED:'true',AUTH_ORIGIN:origin,AUTH_RATE_KEY:'01'.repeat(32),AUTH_LOOKUP_KEY:'02'.repeat(32),AUTH_ENCRYPTION_KEY:'03'.repeat(32),AUTH_EMAIL_FROM:'sender@example.com',RESEND_API_KEY:'re_test_key_12345'};
 globalThis.fetch=async(url,options)=>{if(url!=='https://api.resend.com/emails')throw new Error('Unexpected external request');messages.push(JSON.parse(options.body));return Response.json({id:'test-message'});};
 const post=(path,data,cookie)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)}),env);
 const get=(path,cookie)=>worker.fetch(new Request(origin+path,{headers:{Cookie:cookie}}),env);
 const put=(path,data,cookie,tag)=>worker.fetch(new Request(origin+path,{method:'PUT',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-Account-Session':tag},body:JSON.stringify(data)}),env);
 const cookie=(response,name)=>response.headers.getSetCookie().find(x=>x.startsWith(name+'=')).split(';')[0];
 const first=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),firstId=Buffer.from('first-key');
 assert.equal((await post('/api/auth/enroll/start',{email:'u@example.com'})).status,200);
 const enrollToken=/#confirm-email=([a-f0-9]{64})/.exec(messages[0].text)[1];
 const confirm=await post('/api/auth/enroll/confirm',{token:enrollToken}),enrollCookie=cookie(confirm,'__Host-nagara_enroll');
 const opts=await (await post('/api/auth/enroll/options',{},enrollCookie)).json();
 const finish=await post('/api/auth/enroll/finish',registration(opts,firstId,first.publicKey,origin),enrollCookie);assert.equal(finish.status,200);
 const original=cookie(finish,'__Host-nagara_session'),originalData=await (await get('/api/account',original)).json();
 assert.equal((await put('/api/account/favorite',{episodeId:'ep',enabled:true},original,originalData.sessionTag)).status,200);
 const loginOptions=await post('/api/auth/passkey/options',{}),loginCookie=cookie(loginOptions,'__Host-nagara_passkey_attempt');
 const login=await post('/api/auth/passkey/verify',assertion(await loginOptions.json(),firstId,first.privateKey,origin),loginCookie);assert.equal(login.status,200);
 assert.equal((await post('/api/auth/recovery/start',{email:'u@example.com'})).status,200);
 const recoveryToken=/#recover-account=([a-f0-9]{64})/.exec(messages[1].text)[1];
 const recoveryConfirm=await post('/api/auth/recovery/confirm',{token:recoveryToken}),recoveryCookie=cookie(recoveryConfirm,'__Host-nagara_recovery');
 const recoveryOptions=await (await post('/api/auth/recovery/options',{},recoveryCookie)).json(),second=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),secondId=Buffer.from('second-key');
 const recovered=await post('/api/auth/recovery/finish',registration(recoveryOptions,secondId,second.publicKey,origin),recoveryCookie);assert.equal(recovered.status,200);
 assert.equal((await get('/api/account',original)).status,401);
 const fresh=cookie(recovered,'__Host-nagara_session'),data=await (await get('/api/account',fresh)).json();assert.deepEqual(data.favorites,['ep']);
 assert.equal((await put('/api/account/history',{episodeId:'ep',positionSeconds:40,writerId:'writer-1234567890',sequence:2},fresh,data.sessionTag)).status,200);
 assert.equal((await (await get('/api/account',fresh)).json()).history[0].position_seconds,40);
 console.log('Isolated remote D1: registration, signed passkey login, recovery, favorites and history passed; email delivery was mocked.');
}finally{
 if(id){await request(`/${id}`,'DELETE');console.log('Isolated test database deleted.');}
}
