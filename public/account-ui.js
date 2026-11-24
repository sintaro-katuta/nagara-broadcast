const $=id=>document.getElementById(id);
const cleanFragment=()=>{
 const params=new URLSearchParams(location.hash.slice(1));
 const kind=params.has('confirm-email')?'enroll':params.has('recover-account')?'recovery':null;
 const token=kind?params.get(kind==='enroll'?'confirm-email':'recover-account'):null;
 if(kind)history.replaceState(history.state,'',location.pathname+location.search);
 return kind&&/^[a-f0-9]{64}$/.test(token||'')?{kind,token}:null;
};
const initialLink=cleanFragment();
async function api(path,body,headers={}){
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),credentials:'same-origin'});
 if(!response.ok)throw new Error('操作できませんでした。時間をおいてもう一度お試しください。');
 return response.json();
}
let library;
function webauthn(){
 if(library)return library;
 library=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/webauthn.js';script.onload=()=>window.SimpleWebAuthnBrowser?resolve(window.SimpleWebAuthnBrowser):reject(new Error());script.onerror=()=>reject(new Error());document.head.append(script);}).catch(error=>{library=null;throw error;});
 return library;
}

export function makeAccountUI({onSession,onNotice}){
 let enabled=false,signedIn=false,isAdmin=false,sessionTag=null,refreshTag=null,mode='enroll',link=initialLink,busy=false,stage='anonymous',stateVersion=0,initializing=null;
 let positionRevision=0;const pendingPositions=new Set();
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('nagara-account-session'):null;
 const dialog=$('account-dialog');
 const adminOpen=$('account-admin-open'),adminPanel=$('account-admin-panel');
 const message=text=>{$('account-message').textContent=text;};
 function show(kind){stage=kind;$('account-anonymous').hidden=kind!=='anonymous';$('account-confirm').hidden=kind!=='confirm';$('account-create').hidden=kind!=='create';$('account-signed-in').hidden=kind!=='signed-in';}
 function setBusy(value){busy=value;dialog.querySelectorAll('button,input').forEach(element=>element.disabled=value);}
 async function open(){if(!enabled){await init();if(!enabled){onNotice('ログイン機能を確認できませんでした。接続を確認して、もう一度お試しください。');return;}}if(stage!=='confirm'&&stage!=='create'){show(signedIn?'signed-in':'anonymous');message(signedIn?'ログインしています。':'ログインすると、あとで聴くと再生履歴を別の端末でも使えます。');}if(!dialog.open)dialog.showModal();}
 function invalidate(ready=false,positionTag=null){stateVersion++;signedIn=false;isAdmin=false;sessionTag=null;refreshTag=positionTag;if(adminOpen)adminOpen.hidden=true;if(adminPanel){adminPanel.hidden=true;$('account-admin-storage').textContent='';$('account-admin-mail').textContent='';}onSession(null,ready);}
 function notifyTabs(){if(channel)channel.postMessage('changed');else try{localStorage.setItem('nagara:session-change',crypto.randomUUID());}catch{}}
 async function refresh(){
  const version=stateVersion;
  while(version===stateVersion){
   const revision=positionRevision;
   const response=await fetch('/api/account',{credentials:'same-origin',cache:'no-store'});
   if(version!==stateVersion)return;
   if(response.status===401){invalidate(true);return;}
   if(!response.ok)throw new Error('アカウント情報を読み込めませんでした。');
   const value=await response.json();if(version!==stateVersion)return;
   if(typeof value.sessionTag!=='string'||!/^[a-f0-9]{64}$/.test(value.sessionTag))throw new Error('アカウント情報を確認できませんでした。');
   const pending=[...pendingPositions].filter(item=>item.tag===value.sessionTag);
   if(pending.length||revision!==positionRevision){await Promise.allSettled(pending.map(item=>item.request));continue;}
   refreshTag=null;sessionTag=value.sessionTag;signedIn=true;isAdmin=value.admin===true;if(adminOpen)adminOpen.hidden=!isAdmin;onSession(value,true);return;
  }
 }
 function changedElsewhere(){if(!enabled){init();return;}invalidate(false,sessionTag||refreshTag);refresh().catch(()=>onNotice('アカウント情報を確認できませんでした。'));}
 if(channel)channel.onmessage=event=>{if(event.data==='changed')changedElsewhere();};
 if(!channel&&typeof window.addEventListener==='function')window.addEventListener('storage',event=>{if(event.key==='nagara:session-change')changedElsewhere();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')changedElsewhere();});
 if(typeof window.addEventListener==='function')window.addEventListener('online',changedElsewhere);
 function init(){
  if(initializing)return initializing;
  initializing=(async()=>{try{const response=await fetch('/api/auth/status',{cache:'no-store'});if(!response.ok)throw new Error('アカウントの状態を確認できませんでした。');enabled=(await response.json()).available===true;if(!enabled){onSession(null,true);return;}await refresh();if(link){show('confirm');message(link.kind==='enroll'?'登録を続けるには、メールアドレスを確認してください。':'復旧を続けるには、メールアドレスを確認してください。');if(!dialog.open)dialog.showModal();}}catch{enabled=false;}})().finally(()=>{initializing=null;});
  return initializing;
 }
 async function action(fn){if(busy)return;setBusy(true);try{await fn();}catch(error){message(error?.name==='NotAllowedError'?'操作がキャンセルされました。もう一度お試しください。':error?.message||'操作できませんでした。もう一度お試しください。');}finally{setBusy(false);}}
 $('account-close').onclick=()=>dialog.close();
 async function loadAdmin(){
  if(!isAdmin||!sessionTag||!adminPanel)return;
  const version=stateVersion,tag=sessionTag;adminPanel.hidden=false;
  $('account-admin-storage').textContent='音声の情報を読み込んでいます。';$('account-admin-mail').textContent='メールの使用状況を読み込んでいます。';
  try{
   const response=await fetch('/api/admin/usage',{headers:{'X-Account-Session':tag},credentials:'same-origin',cache:'no-store'});
   if(version!==stateVersion||tag!==sessionTag)return;
   if(response.status===401||response.status===409){changedElsewhere();return;}
   if(!response.ok)throw new Error();const result=await response.json();if(version!==stateVersion||tag!==sessionTag)return;
   $('account-admin-storage').textContent=`登録済み音声：${result.storage.count.toLocaleString()}本・${(result.storage.bytes/1e9).toFixed(2)} GB`;
   const show=part=>`${part.used.toLocaleString()} / ${part.limit===null?'上限なし':part.limit.toLocaleString()}通（更新 ${new Date(part.resetsAt).toLocaleString('ja-JP')}）`;
   $('account-admin-mail').textContent=result.resend?`メール使用数　今日：${show(result.resend.daily)}　今月：${show(result.resend.monthly)}`:'メールの使用状況を取得できません。接続設定を確認してください。';
  }catch{if(version===stateVersion){$('account-admin-storage').textContent='管理情報を取得できませんでした。';$('account-admin-mail').textContent='時間をおいて更新してください。';}}
 }
 if(adminOpen)adminOpen.onclick=loadAdmin;if($('account-admin-refresh'))$('account-admin-refresh').onclick=loadAdmin;
 dialog.querySelectorAll('[data-account-restart]').forEach(button=>button.onclick=()=>{link=null;show(signedIn?'signed-in':'anonymous');message('ログインすると、あとで聴くと再生履歴を別の端末でも使えます。');});
 $('account-signin').onclick=()=>action(async()=>{const client=await webauthn(),options=await api('/api/auth/passkey/options',{}),response=await client.startAuthentication({optionsJSON:options});await api('/api/auth/passkey/verify',response);invalidate();notifyTabs();await refresh();show('signed-in');dialog.close();onNotice('ログインしました。');});
 $('account-register-toggle').onclick=()=>{mode='enroll';$('account-email-form').hidden=false;$('account-email-submit').textContent='確認メールを送る';$('account-email-description').textContent='確認メールをお送りします。メールアドレスは、パスキーを使えなくなったときの復旧にも使います。';$('account-email').focus();};
 $('account-recover-toggle').onclick=()=>{mode='recovery';$('account-email-form').hidden=false;$('account-email-submit').textContent='復旧メールを送る';$('account-email-description').textContent='登録済みのメールアドレスに復旧の案内をお送りします。';$('account-email').focus();};
 $('account-email-form').onsubmit=event=>{event.preventDefault();action(async()=>{await api(`/api/auth/${mode}/start`,{email:$('account-email').value});$('account-email-form').reset();$('account-email-form').hidden=true;message('手続きできる場合はメールが届きます。受信箱をご確認ください。');});};
 $('account-confirm-button').onclick=()=>action(async()=>{if(!link)throw new Error('リンクを確認できません。メールから開き直してください。');await api(`/api/auth/${link.kind}/confirm`,{token:link.token});mode=link.kind;link=null;show('create');message('この端末で使うパスキーを登録してください。');});
 $('account-create-button').onclick=()=>action(async()=>{const client=await webauthn(),options=await api(`/api/auth/${mode}/options`,{}),response=await client.startRegistration({optionsJSON:options});await api(`/api/auth/${mode}/finish`,response);invalidate();notifyTabs();await refresh();show('signed-in');dialog.close();onNotice('パスキーを登録しました。');});
 $('account-logout').onclick=()=>action(async()=>{const tag=sessionTag;const response=await fetch('/api/auth/logout',{method:'POST',headers:{'X-Account-Session':tag||''},credentials:'same-origin'});if(response.status===409||response.status===401){changedElsewhere();throw new Error('アカウントが変更されました。');}if(!response.ok)throw new Error('ログアウトできませんでした。');invalidate(true);notifyTabs();show('anonymous');dialog.close();onNotice('ログアウトしました。');});
 async function write(path,body,keepalive=false,allowRefresh=false){
  const tag=sessionTag||(allowRefresh?refreshTag:null);if(!tag)throw new Error('ログインが必要です。');
  const request=fetch(path,{method:'PUT',headers:{'Content-Type':'application/json','X-Account-Session':tag},body:JSON.stringify(body),credentials:'same-origin',keepalive});
  const pending=allowRefresh?{tag,request}:null;if(pending){positionRevision++;pendingPositions.add(pending);}
  let response;try{response=await request;}finally{if(pending){pendingPositions.delete(pending);positionRevision++;}}
  if((response.status===401||response.status===409)&&(sessionTag===tag||refreshTag===tag)){invalidate();refresh().catch(()=>onNotice('アカウント情報を確認できませんでした。'));}
  if(!response.ok)throw new Error(response.status===409?'アカウントが変更されました。':'保存できませんでした。接続を確認してください。');
 }
 return {
  init,
  open,
  revalidate:changedElsewhere,
  isSignedIn:()=>signedIn,
  canWritePosition:()=>!!(sessionTag||refreshTag),
  async setFavorite(id,enabled){return write('/api/account/favorite',{episodeId:id,enabled});},
  async setPosition(id,positionSeconds,writerId,sequence,keepalive=false){return write('/api/account/history',{episodeId:id,positionSeconds,writerId,sequence},keepalive,true);}
 };
}
