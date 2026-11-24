import {createRemoteJWKSet,jwtVerify,importPKCS8,SignJWT} from 'jose';
import {createSession} from './sessions.mjs';

const enc=new TextEncoder();
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const random=()=>base64(crypto.getRandomValues(new Uint8Array(32)));
const hash=async text=>base64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text))));
const stateCookie='__Host-nagara_oauth';
const cookie=(value,maxAge)=>`${stateCookie}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
const keys={google:createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),apple:createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))};
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
function redirect(location,cookies=[]){const h=new Headers({...headers,Location:location});for(const c of cookies)h.append('Set-Cookie',c);return new Response(null,{status:303,headers:h});}
function config(env,provider){
 if(!env.AUTH_ORIGIN||!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(env.AUTH_ORIGIN))return null;
 if(provider==='google'&&env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET)return {clientId:env.GOOGLE_CLIENT_ID,authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',issuer:'https://accounts.google.com'};
 if(provider==='apple'&&env.APPLE_CLIENT_ID&&env.APPLE_TEAM_ID&&env.APPLE_KEY_ID&&env.APPLE_PRIVATE_KEY)return {clientId:env.APPLE_CLIENT_ID,authorize:'https://appleid.apple.com/auth/authorize',token:'https://appleid.apple.com/auth/token',issuer:'https://appleid.apple.com'};
 return null;
}
async function clientSecret(env,provider,cfg){
 if(provider==='google')return env.GOOGLE_CLIENT_SECRET;
 const key=await importPKCS8(env.APPLE_PRIVATE_KEY,'ES256');
 return new SignJWT({}).setProtectedHeader({alg:'ES256',kid:env.APPLE_KEY_ID}).setIssuer(env.APPLE_TEAM_ID).setSubject(cfg.clientId).setAudience('https://appleid.apple.com').setIssuedAt().setExpirationTime('5m').sign(key);
}
function getCookie(request){const found=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(stateCookie+'='));return found.length===1?found[0].slice(stateCookie.length+1):null;}
async function accountFor(db,provider,subject){
 const candidate=crypto.randomUUID();
 await db.batch([
  db.prepare('INSERT INTO accounts(id) VALUES (?)').bind(candidate),
  db.prepare('INSERT OR IGNORE INTO account_identities(provider,subject,account_id) VALUES (?,?,?)').bind(provider,subject,candidate),
  db.prepare('DELETE FROM accounts WHERE id=? AND NOT EXISTS (SELECT 1 FROM account_identities WHERE account_id=?)').bind(candidate,candidate)
 ]);
 const row=await db.prepare('SELECT account_id FROM account_identities WHERE provider=? AND subject=?').bind(provider,subject).first();
 if(!row)throw new Error('identity missing');return row.account_id;
}
// The Worker keeps these routes disabled unless AUTH_ENABLED is explicitly set.
export async function oauth(request,env){
 const url=new URL(request.url),match=/^\/api\/auth\/(google|apple)\/(start|callback)$/.exec(url.pathname);
 if(!match)return null;
 const [,provider,action]=match,cfg=config(env,provider);
 if(!cfg||url.origin!==env.AUTH_ORIGIN)return new Response('ログインは準備中です。',{status:503,headers});
 if(request.method!=='GET')return new Response(null,{status:405,headers});
 const callback=env.AUTH_ORIGIN+`/api/auth/${provider}/callback`;
 if(action==='start'){
  const state=random(),nonce=random(),verifier=random(),now=Math.floor(Date.now()/1000);
  await env.DB.prepare('DELETE FROM oauth_states WHERE expires_at<=?').bind(now).run();
  await env.DB.prepare('INSERT INTO oauth_states(state_hash,provider,nonce,verifier,expires_at) VALUES (?,?,?,?,?)').bind(await hash(state),provider,nonce,verifier,now+600).run();
  const target=new URL(cfg.authorize);
  const params={client_id:cfg.clientId,redirect_uri:callback,response_type:'code',state,nonce};
  if(provider==='google')Object.assign(params,{scope:'openid',code_challenge:await hash(verifier),code_challenge_method:'S256'});
  else params.response_mode='query';
  target.search=new URLSearchParams(params).toString();return redirect(target.toString(),[cookie(state,600)]);
 }
 const state=url.searchParams.get('state'),code=url.searchParams.get('code'),stored=getCookie(request);
 if(!state||!stored||state!==stored||!code||state.length>128||code.length>4096)return redirect('/?login=failed',[cookie('',0)]);
 const now=Math.floor(Date.now()/1000);
 const attempt=await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=? AND provider=? AND expires_at>? RETURNING nonce,verifier').bind(await hash(state),provider,now).first();
 if(!attempt)return redirect('/?login=failed',[cookie('',0)]);
 try{
  const payload={grant_type:'authorization_code',code,client_id:cfg.clientId,client_secret:await clientSecret(env,provider,cfg),redirect_uri:callback};
  if(provider==='google')payload.code_verifier=attempt.verifier;
  const result=await fetch(cfg.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(payload)});
  if(!result.ok)throw new Error('token exchange failed');
  const tokens=await result.json();
  const {payload:claims}=await jwtVerify(tokens.id_token,keys[provider],{issuer:cfg.issuer,audience:cfg.clientId,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce'],maxTokenAge:'10m'});
  if(typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255||claims.nonce!==attempt.nonce)throw new Error('invalid identity');
  const id=await accountFor(env.DB,provider,claims.sub);
  return redirect('/',[cookie('',0),await createSession(env.DB,id)]);
 }catch{return redirect('/?login=failed',[cookie('',0)]);}
}
