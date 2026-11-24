const $=id=>document.getElementById(id);
const cleanFragment=()=>{
 const params=new URLSearchParams(location.hash.slice(1));
 const kind=params.has('confirm-email')?'enroll':params.has('recover-account')?'recovery':null;
 const token=kind?params.get(kind==='enroll'?'confirm-email':'recover-account'):null;
 if(kind)history.replaceState(history.state,'',location.pathname+location.search);
 return kind&&/^[a-f0-9]{64}$/.test(token||'')?{kind,token}:null;
};
const initialLink=cleanFragment();
async function api(path,body){
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin'});
 if(!response.ok)throw new Error('操作できませんでした。時間をおいてもう一度お試しください。');
 return response.json();
}
let library;
function webauthn(){
 if(library)return library;
 library=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/webauthn.js';script.onload=()=>window.SimpleWebAuthnBrowser?resolve(window.SimpleWebAuthnBrowser):reject(new Error());script.onerror=()=>reject(new Error());document.head.append(script);});
 return library;
}

export function makeAccountUI({onSession,onNotice}){
 let enabled=false,signedIn=false,mode='enroll',link=initialLink,busy=false;
 const dialog=$('account-dialog');
 const message=text=>{$('account-message').textContent=text;};
 function show(kind){$('account-anonymous').hidden=kind!=='anonymous';$('account-confirm').hidden=kind!=='confirm';$('account-create').hidden=kind!=='create';$('account-signed-in').hidden=kind!=='signed-in';}
 function setBusy(value){busy=value;dialog.querySelectorAll('button,input').forEach(element=>element.disabled=value);}
 function open(){if(!enabled){onNotice('ログイン機能は準備中です。');return;}show(signedIn?'signed-in':'anonymous');message(signedIn?'ログインしています。':'ログインすると、あとで聴くと再生履歴を別の端末でも使えます。');if(!dialog.open)dialog.showModal();}
 async function refresh(){
  const response=await fetch('/api/account',{credentials:'same-origin',cache:'no-store'});
  if(response.status===401){signedIn=false;onSession(null);return;}
  if(!response.ok)throw new Error('アカウント情報を読み込めませんでした。');
  const value=await response.json();signedIn=true;onSession(value);
 }
 async function action(fn){if(busy)return;setBusy(true);try{await fn();}catch(error){message(error?.name==='NotAllowedError'?'操作がキャンセルされました。もう一度お試しください。':error?.message||'操作できませんでした。もう一度お試しください。');}finally{setBusy(false);}}
 $('account-close').onclick=()=>dialog.close();
 $('account-signin').onclick=()=>action(async()=>{const client=await webauthn(),options=await api('/api/auth/passkey/options',{}),response=await client.startAuthentication({optionsJSON:options});await api('/api/auth/passkey/verify',response);await refresh();dialog.close();onNotice('ログインしました。');});
 $('account-register-toggle').onclick=()=>{mode='enroll';$('account-email-form').hidden=false;$('account-email-submit').textContent='確認メールを送る';$('account-email-description').textContent='確認メールをお送りします。メールアドレスは、パスキーを使えなくなったときの復旧にも使います。';$('account-email').focus();};
 $('account-recover-toggle').onclick=()=>{mode='recovery';$('account-email-form').hidden=false;$('account-email-submit').textContent='復旧メールを送る';$('account-email-description').textContent='登録済みのメールアドレスに復旧の案内をお送りします。';$('account-email').focus();};
 $('account-email-form').onsubmit=event=>{event.preventDefault();action(async()=>{await api(`/api/auth/${mode}/start`,{email:$('account-email').value});$('account-email-form').reset();$('account-email-form').hidden=true;message('手続きできる場合はメールが届きます。受信箱をご確認ください。');});};
 $('account-confirm-button').onclick=()=>action(async()=>{if(!link)throw new Error('リンクを確認できません。メールから開き直してください。');await api(`/api/auth/${link.kind}/confirm`,{token:link.token});mode=link.kind;link=null;show('create');message('この端末で使うパスキーを登録してください。');});
 $('account-create-button').onclick=()=>action(async()=>{const client=await webauthn(),options=await api(`/api/auth/${mode}/options`,{}),response=await client.startRegistration({optionsJSON:options});await api(`/api/auth/${mode}/finish`,response);await refresh();dialog.close();onNotice('パスキーを登録しました。');});
 $('account-logout').onclick=()=>action(async()=>{await api('/api/auth/logout',{});signedIn=false;onSession(null);dialog.close();onNotice('ログアウトしました。');});
 return {
  async init(){try{const response=await fetch('/api/auth/status',{cache:'no-store'});enabled=response.ok&&(await response.json()).available===true;if(!enabled)return;await refresh();if(link){show('confirm');message(link.kind==='enroll'?'登録を続けるには、メールアドレスを確認してください。':'復旧を続けるには、メールアドレスを確認してください。');dialog.showModal();}}catch{enabled=false;}},
  open,
  isSignedIn:()=>signedIn,
  async setFavorite(id,enabled){const response=await fetch('/api/account/favorite',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({episodeId:id,enabled}),credentials:'same-origin'});if(response.status===401){signedIn=false;onSession(null);}if(!response.ok)throw new Error('保存できませんでした。接続を確認してください。');},
  async setPosition(id,positionSeconds){const response=await fetch('/api/account/history',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({episodeId:id,positionSeconds}),credentials:'same-origin'});if(response.status===401){signedIn=false;onSession(null);}if(!response.ok)throw new Error('再生履歴を同期できませんでした。');}
 };
}
