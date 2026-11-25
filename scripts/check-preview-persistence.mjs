const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_READ_TOKEN,id='5de2882e-e9f5-45be-bf33-81eaab1c4c90';
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Read-only credentials unavailable');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${id}`;
async function request(path,options={}){const response=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});const body=await response.json();if(!response.ok||!body.success)throw new Error('Isolated database inspection failed');return body.result;}
const db=await request('');if(db.uuid!==id||db.name!=='nagara-auth-preview')throw new Error('Wrong database');
const sql="SELECT EXISTS (SELECT 1 FROM favorites f JOIN listening_history h ON f.account_id=h.account_id AND f.episode_id=h.episode_id WHERE f.episode_id='preview-audio-fixture') AS same_account_saved_and_played";
const result=await request('/query',{method:'POST',body:JSON.stringify({sql})});
console.log(JSON.stringify({sameAccountSavedAndPlayed:result[0]?.results?.[0]?.same_account_saved_and_played===1}));
