const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_WRITE_TOKEN;
const id='5de2882e-e9f5-45be-bf33-81eaab1c4c90';
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Missing isolated D1 credentials');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${id}`;
async function request(path,options={}){const response=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok||!data.success)throw new Error('Isolated D1 request failed');return data.result;}
const db=await request('');if(db.uuid!==id||db.name!=='nagara-auth-preview')throw new Error('Unexpected database; refusing fixture update');
const sql='INSERT OR IGNORE INTO episodes (id,title,channel,description,source,duration,size,date,object_key) VALUES (?,?,?,?,?,?,?,?,?)';
const params=['preview-audio-fixture','テスト用の無音エピソード','tech','再生履歴と保存の確認用です。30秒間、音は流れません。','',30,480044,'2026-11-26T00:00:00.000Z','preview-only/silent.wav'];
const result=await request('/query',{method:'POST',body:JSON.stringify({sql,params})});if(result[0]?.success!==true)throw new Error('Fixture insert failed');
const check=await request('/query',{method:'POST',body:JSON.stringify({sql:'SELECT id,duration,size,object_key FROM episodes WHERE id=?',params:[params[0]]})});
const row=check[0]?.results?.[0];if(row?.id!==params[0]||row.duration!==30||row.size!==480044||row.object_key!==params[8])throw new Error('Unexpected fixture; refusing to proceed');
console.log('Synthetic preview episode ready in isolated D1');
