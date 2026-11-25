const name='__Host-nagara_preview';
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>テスト環境</title><p id="status">テスト環境へのアクセスを確認しています。</p><script>
(async()=>{const p=new URLSearchParams(location.hash.slice(1)),token=p.get('preview-access');if(!token){document.querySelector('#status').textContent='テスト用のリンクを同じブラウザで開いてください。';return;}history.replaceState(history.state,'',location.pathname+location.search);try{const r=await fetch('/__preview/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});if(!r.ok)throw Error();location.replace('/');}catch{document.querySelector('#status').textContent='リンクを確認できませんでした。';}})();</script></html>`;
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const same=(a,b)=>{let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
const cookie=request=>{const parts=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));return parts.length===1?parts[0].slice(name.length+1):null;};
async function tokenBody(request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||'')||!request.body||Number(request.headers.get('Content-Length'))>1024)throw new Error();
 const reader=request.body.getReader(),chunks=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();throw new Error();}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))?.token;
}
// This wrapper is used only by a separately configured test Worker.
export function makeStagingGate(app,now=()=>Date.now()){
 return {async fetch(request,env,ctx){
  const url=new URL(request.url),token=env.PREVIEW_ACCESS_TOKEN,expires=Number(env.PREVIEW_EXPIRES_AT);
  if(env.PREVIEW_ONLY!=='true'||env.AUTH_ORIGIN!==url.origin||url.hostname==='nagara-broadcast.sintaro-katuta.com'||!hex(token)||!Number.isSafeInteger(expires)||expires<=Math.floor(now()/1000))return new Response('テスト環境は利用できません。',{status:503,headers});
  if(url.pathname==='/__preview/access'){
   if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)return new Response(null,{status:403,headers});
   let value;try{value=await tokenBody(request);}catch{return new Response(null,{status:400,headers});}
   if(!hex(value)||!same(value,token))return new Response(null,{status:403,headers});
   return new Response(null,{status:204,headers:{...headers,'Set-Cookie':`${name}=${token}; Path=/; Max-Age=${Math.min(3600,expires-Math.floor(now()/1000))}; HttpOnly; Secure; SameSite=Lax`}});
  }
  const value=cookie(request);if(!hex(value)||!same(value,token))return new Response(html,{status:401,headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  const response=await app.fetch(request,env,ctx);const out=new Response(response.body,response);out.headers.set('X-Robots-Tag','noindex, nofollow');out.headers.set('Cache-Control','no-store');out.headers.set('Referrer-Policy','no-referrer');return out;
 }};
}
