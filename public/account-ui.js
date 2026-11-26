const $=id=>document.getElementById(id);
const cleanFragment=()=>{
 const params=new URLSearchParams(location.hash.slice(1));
 const kind=params.has('confirm-email')?'enroll':params.has('recover-account')?'recovery':params.has('admin-recovery')?'admin-recovery':null;
 const token=kind?params.get(kind==='enroll'?'confirm-email':kind==='recovery'?'recover-account':'admin-recovery'):null;
 if(kind)history.replaceState(history.state,'',location.pathname+location.search);
 else if(params.has('preview-access')){params.delete('preview-access');const remaining=params.toString();history.replaceState(history.state,'',location.pathname+location.search+(remaining?'#'+remaining:''));}
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
 let enabled=false,signedIn=false,isAdmin=false,sessionTag=null,refreshTag=null,historyGeneration=null,refreshGeneration=null,mode='enroll',link=initialLink,busy=false,stage='anonymous',stateVersion=0,initializing=null;
 let positionRevision=0;const pendingPositions=new Set();
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('nagara-account-session'):null;
 const dialog=$('account-dialog');
 const adminOpen=$('account-admin-open'),adminPanel=$('account-admin-panel');
 const message=text=>{$('account-message').textContent=text;};
 function show(kind){stage=kind;$('account-anonymous').hidden=kind!=='anonymous';$('account-confirm').hidden=kind!=='confirm';$('account-create').hidden=kind!=='create';$('account-signed-in').hidden=kind!=='signed-in';if($('account-admin-recovery-wait'))$('account-admin-recovery-wait').hidden=kind!=='admin-wait';}
 function showAdminWait(code){if(!/^[a-f0-9]{64}$/.test(code||''))throw new Error('復旧コードを確認できませんでした。');$('account-admin-recovery-code').textContent=code;mode='admin-recovery';show('admin-wait');message('運用者による確認をお待ちください。');}
 function setBusy(value){busy=value;dialog.querySelectorAll('button,input').forEach(element=>element.disabled=value);}
 async function open(){if(!enabled){await init();if(!enabled){onNotice('ログイン機能を確認できませんでした。接続を確認して、もう一度お試しください。');return;}}if(stage!=='confirm'&&stage!=='create'&&stage!=='admin-wait'){show(signedIn?'signed-in':'anonymous');message(signedIn?'ログインしています。':'ログインすると、あとで聴くと再生履歴を別の端末でも使えます。');}if(!dialog.open)dialog.showModal();}
 function invalidate(ready=false,positionTag=null,positionGeneration=null){stateVersion++;signedIn=false;isAdmin=false;sessionTag=null;historyGeneration=null;refreshTag=positionTag;refreshGeneration=positionGeneration;if($('account-admin-setup-result'))$('account-admin-setup-result').textContent='';if($('account-admin-setup-copy'))$('account-admin-setup-copy').hidden=true;if(adminOpen)adminOpen.hidden=true;if(adminPanel){adminPanel.hidden=true;$('account-admin-storage').textContent='';$('account-admin-mail').textContent='';$('account-admin-notices').textContent='';if($('account-admin-mail-pools'))$('account-admin-mail-pools').textContent='';if($('account-admin-mail-warning'))$('account-admin-mail-warning').textContent='';if($('account-admin-retry'))$('account-admin-retry').hidden=true;if($('account-admin-retry-help'))$('account-admin-retry-help').hidden=true;if($('account-admin-retry-result'))$('account-admin-retry-result').textContent='';}onSession(null,ready);}
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
   if(!Number.isSafeInteger(value.historyGeneration)||value.historyGeneration<0)throw new Error('再生履歴の状態を確認できませんでした。');
   const pending=[...pendingPositions].filter(item=>item.tag===value.sessionTag);
   if(pending.length||revision!==positionRevision){await Promise.allSettled(pending.map(item=>item.request));continue;}
   refreshTag=null;refreshGeneration=null;sessionTag=value.sessionTag;historyGeneration=value.historyGeneration;signedIn=true;isAdmin=value.admin===true;if(adminOpen)adminOpen.hidden=!isAdmin;onSession(value,true);return;
  }
 }
 function changedElsewhere(){if(!enabled){init();return;}invalidate(false,sessionTag||refreshTag,historyGeneration??refreshGeneration);refresh().catch(()=>onNotice('アカウント情報を確認できませんでした。'));}
 if(channel)channel.onmessage=event=>{if(event.data==='changed')changedElsewhere();};
 if(!channel&&typeof window.addEventListener==='function')window.addEventListener('storage',event=>{if(event.key==='nagara:session-change')changedElsewhere();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')changedElsewhere();});
 if(typeof window.addEventListener==='function')window.addEventListener('online',changedElsewhere);
 function init(){
  if(initializing)return initializing;
  initializing=(async()=>{try{const response=await fetch('/api/auth/status',{cache:'no-store'});if(!response.ok)throw new Error('アカウントの状態を確認できませんでした。');const status=await response.json();enabled=status.available===true;if($('account-add-passkey-section'))$('account-add-passkey-section').hidden=!enabled||status.passkeyAddAvailable!==true;if($('account-admin-setup-section'))$('account-admin-setup-section').hidden=!enabled||status.adminSetupAvailable!==true;if($('account-admin-recover-toggle'))$('account-admin-recover-toggle').hidden=!enabled||status.adminRecoveryAvailable!==true;if(!enabled){onSession(null,true);return;}await refresh();if(link){show('confirm');message(link.kind==='enroll'?'登録を続けるには、メールアドレスを確認してください。':'復旧を続けるには、メールアドレスを確認してください。');if(!dialog.open)dialog.showModal();}else if(status.adminRecoveryAvailable===true&&$('account-admin-recovery-wait')){try{const pending=await api('/api/auth/admin-recovery/status',{});showAdminWait(pending.approvalCode);if(!dialog.open)dialog.showModal();}catch{}}}catch{enabled=false;}})().finally(()=>{initializing=null;});
  return initializing;
 }
 async function action(fn){if(busy)return;setBusy(true);try{await fn();}catch(error){message(error?.code==='ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'?'このパスキーは登録済みです。登録済みのパスキーでログインするか、復旧には別のパスキーの保存先を選んでください。':error?.name==='NotAllowedError'?'操作がキャンセルされました。もう一度お試しください。':error?.message||'操作できませんでした。もう一度お試しください。');}finally{setBusy(false);}}
 $('account-close').onclick=()=>dialog.close();
 async function loadAdmin(){
  if(!isAdmin||!sessionTag||!adminPanel)return;
  const version=stateVersion,tag=sessionTag;adminPanel.hidden=false;
  const retry=$('account-admin-retry'),help=$('account-admin-retry-help');if(retry)retry.hidden=true;if(help)help.hidden=true;
  $('account-admin-storage').textContent='音声の情報を読み込んでいます。';$('account-admin-mail').textContent='メールの使用状況を読み込んでいます。';$('account-admin-notices').textContent='セキュリティ通知の状態を読み込んでいます。';
  if($('account-admin-mail-pools'))$('account-admin-mail-pools').textContent='アプリ内のメール制限を読み込んでいます。';if($('account-admin-mail-warning'))$('account-admin-mail-warning').textContent='';
  try{
   const response=await fetch('/api/admin/usage',{headers:{'X-Account-Session':tag},credentials:'same-origin',cache:'no-store'});
   if(version!==stateVersion||tag!==sessionTag)return;
   if(response.status===401||response.status===409){changedElsewhere();return;}
   if(!response.ok)throw new Error();const result=await response.json();if(version!==stateVersion||tag!==sessionTag)return;
   $('account-admin-storage').textContent=`登録済み音声：${result.storage.count.toLocaleString()}本・${(result.storage.bytes/1e9).toFixed(2)} GB`;
   const show=part=>`${part.used.toLocaleString()} / ${part.limit===null?'上限なし':part.limit.toLocaleString()}通（更新 ${new Date(part.resetsAt).toLocaleString('ja-JP')}）`;
   $('account-admin-mail').textContent=result.resend?`メール使用数　今日：${show(result.resend.daily)}　今月：${show(result.resend.monthly)}`:'メールの使用状況を取得できません。接続設定を確認してください。';
   $('account-admin-notices').textContent=result.notices?`セキュリティ通知：送信待ち ${result.notices.waiting.toLocaleString()}件・要確認 ${result.notices.blocked.toLocaleString()}件`:'セキュリティ通知の状態を取得できません。';
   const pools=result.mailPools,poolElement=$('account-admin-mail-pools'),warning=$('account-admin-mail-warning');
   const showPool=part=>`${part.used} / ${part.limit}${part.resetsAt?`（解除 ${new Date(part.resetsAt).toLocaleString('ja-JP')}）`:''}`;
   if(poolElement)poolElement.textContent=pools?`アプリ内の送信制限（最大24時間）：登録 ${showPool(pools.enroll)}、復旧 ${showPool(pools.recovery)}、管理者復旧 ${showPool(pools['admin-recovery'])}。送信予約の数で、実際の配送数ではありません。`:'アプリ内のメール制限を取得できません。';
   if(warning){const near=part=>part&&part.limit!==null&&(part.limit===0||part.used>=part.limit*0.8);const alerts=[];if(result.resend&&(near(result.resend.daily)||near(result.resend.monthly)))alerts.push('Resendの送信枠が残り少なくなっています。');if(pools&&Object.values(pools).some(near))alerts.push('アプリ内のメール制限が上限に近づいています。');if(result.notices?.blocked)alerts.push('送れずに確認が必要な通知があります。');warning.textContent=alerts.join(' ');}
   if(retry)retry.hidden=!result.notices?.blocked;if(help)help.hidden=!result.notices?.blocked;
  }catch{if(version===stateVersion){$('account-admin-storage').textContent='管理情報を取得できませんでした。';$('account-admin-mail').textContent='時間をおいて更新してください。';$('account-admin-notices').textContent='';if($('account-admin-mail-pools'))$('account-admin-mail-pools').textContent='';if($('account-admin-mail-warning'))$('account-admin-mail-warning').textContent='';}}
 }
 if(adminOpen)adminOpen.onclick=loadAdmin;if($('account-admin-refresh'))$('account-admin-refresh').onclick=loadAdmin;
 const retry=$('account-admin-retry');if(retry)retry.onclick=async()=>{
  if(!isAdmin||!sessionTag||retry.disabled)return;
  const version=stateVersion,tag=sessionTag,result=$('account-admin-retry-result');retry.disabled=true;result.textContent='処理しています。';
  try{
   const response=await fetch('/api/admin/notices/retry',{method:'POST',headers:{'X-Account-Session':tag},credentials:'same-origin',cache:'no-store'});
   if(version!==stateVersion||tag!==sessionTag)return;
   if(response.status===401||response.status===409){changedElsewhere();return;}
   if(!response.ok)throw new Error();const data=await response.json();if(version!==stateVersion||tag!==sessionTag)return;
   await loadAdmin();if(version===stateVersion&&tag===sessionTag)result.textContent=`${data.queued}件を再送待ちに戻しました。定期処理で順次送信します。`;
  }catch{if(version===stateVersion&&tag===sessionTag)result.textContent='操作できませんでした。時間をおいて更新してください。';}
  finally{retry.disabled=false;}
 };
 dialog.querySelectorAll('[data-account-restart]').forEach(button=>button.onclick=async()=>{if(stage==='admin-wait'){try{await api('/api/auth/admin-recovery/cancel',{});}catch{message('操作を終了できませんでした。通信状態を確認してください。');return;}$('account-admin-recovery-code').textContent='';}link=null;show(signedIn?'signed-in':'anonymous');message('ログインすると、あとで聴くと再生履歴を別の端末でも使えます。');});
 $('account-signin').onclick=()=>action(async()=>{const client=await webauthn(),options=await api('/api/auth/passkey/options',{}),response=await client.startAuthentication({optionsJSON:options});await api('/api/auth/passkey/verify',response);invalidate();notifyTabs();await refresh();show('signed-in');dialog.close();onNotice('ログインしました。');});
 $('account-register-toggle').onclick=()=>{mode='enroll';$('account-email-form').hidden=false;$('account-email-submit').textContent='確認メールを送る';$('account-email-description').textContent='確認メールをお送りします。メールアドレスは、パスキーを使えなくなったときの復旧にも使います。';$('account-email').focus();};
 $('account-recover-toggle').onclick=()=>{mode='recovery';$('account-email-form').hidden=false;$('account-email-submit').textContent='復旧メールを送る';$('account-email-description').textContent='登録済みのメールアドレスに復旧の案内をお送りします。復旧が完了すると、以前のパスキーはすべて使えなくなります。';$('account-email').focus();};
 if($('account-admin-recover-toggle'))$('account-admin-recover-toggle').onclick=()=>{mode='admin-recovery';$('account-email-form').hidden=false;$('account-email-submit').textContent='管理者の復旧メールを送る';$('account-email-description').textContent='登録済みのメールアドレスへ復旧の案内をお送りします。運用者の確認も必要です。';$('account-email').focus();};
 $('account-email-form').onsubmit=event=>{event.preventDefault();action(async()=>{await api(`/api/auth/${mode}/start`,{email:$('account-email').value});$('account-email-form').reset();$('account-email-form').hidden=true;message('手続きできる場合はメールが届きます。受信箱をご確認ください。');});};
 $('account-confirm-button').onclick=()=>action(async()=>{if(!link)throw new Error('リンクを確認できません。メールから開き直してください。');const kind=link.kind,result=await api(`/api/auth/${kind}/confirm`,{token:link.token});mode=kind;link=null;if(kind==='admin-recovery'){showAdminWait(result.approvalCode);return;}show('create');message(kind==='recovery'?'新しいパスキーを登録してください。復旧が完了すると以前のパスキーは使えなくなります。':'この端末で使うパスキーを登録してください。');});
 $('account-create-button').onclick=()=>action(async()=>{const client=await webauthn(),options=await api(`/api/auth/${mode}/options`,{}),response=await client.startRegistration({optionsJSON:options});await api(`/api/auth/${mode}/finish`,response);invalidate();notifyTabs();await refresh();show('signed-in');dialog.close();onNotice(mode==='recovery'?'復旧しました。別の保存先にも予備のパスキーを追加してください。':'パスキーを登録しました。');});
 if($('account-admin-recovery-copy'))$('account-admin-recovery-copy').onclick=async()=>{const code=$('account-admin-recovery-code').textContent;if(!/^[a-f0-9]{64}$/.test(code))return;try{await navigator.clipboard.writeText(code);onNotice('コードをコピーしました。');}catch{onNotice('コードを長押ししてコピーしてください。');}};
 if($('account-admin-recovery-continue'))$('account-admin-recovery-continue').onclick=()=>action(async()=>{const client=await webauthn();let options;try{options=await api('/api/auth/admin-recovery/options',{});}catch{throw new Error('運用者の確認後に、もう一度お試しください。');}const response=await client.startRegistration({optionsJSON:options});try{await api('/api/auth/admin-recovery/finish',response);}catch{throw new Error('登録できませんでした。もう一度試し、続けられない場合は運用者に再確認を依頼してください。');}$('account-admin-recovery-code').textContent='';invalidate();notifyTabs();await refresh();show('signed-in');dialog.close();onNotice('管理者のパスキーを復旧しました。別の保存先にも予備を追加してください。');});
 if($('account-add-passkey'))$('account-add-passkey').onclick=()=>action(async()=>{
  const tag=sessionTag;if(!tag)throw new Error('ログインが必要です。');
  const headers={'X-Account-Session':tag},check=()=>{if(tag!==(sessionTag||refreshTag))throw new Error('アカウントが変更されました。');};
  const client=await webauthn(),auth=await api('/api/auth/passkey/register/reauth-options',{},headers);check();
  const assertion=await client.startAuthentication({optionsJSON:auth});check();await api('/api/auth/passkey/register/reauth-verify',assertion,headers);check();
  const options=await api('/api/auth/passkey/register/options',{},headers);check();const response=await client.startRegistration({optionsJSON:options});check();
  await api('/api/auth/passkey/register/verify',response,headers);check();message('パスキーを追加しました。登録済みのメールアドレスにもお知らせします。');onNotice('パスキーを追加しました。');
 });
 if($('account-admin-setup-code'))$('account-admin-setup-code').onclick=()=>action(async()=>{
  const tag=sessionTag;if(!tag)throw new Error('ログインが必要です。');const result=await api('/api/account/admin-setup-code',{}, {'X-Account-Session':tag});
  if(tag!==(sessionTag||refreshTag))throw new Error('アカウントが変更されました。');
  if(!/^[A-Za-z0-9_-]{22}$/.test(result.code||''))throw new Error('コードを確認できませんでした。');
  $('account-admin-setup-result').textContent=result.code;if($('account-admin-setup-copy'))$('account-admin-setup-copy').hidden=false;
 });
 if($('account-admin-setup-copy'))$('account-admin-setup-copy').onclick=async()=>{const code=$('account-admin-setup-result').textContent;if(!/^[A-Za-z0-9_-]{22}$/.test(code))return;try{await navigator.clipboard.writeText(code);onNotice('コードをコピーしました。');}catch{onNotice('コードを長押ししてコピーしてください。');}};
 $('account-logout').onclick=()=>action(async()=>{const tag=sessionTag;const response=await fetch('/api/auth/logout',{method:'POST',headers:{'X-Account-Session':tag||''},credentials:'same-origin'});if(response.status===409||response.status===401){changedElsewhere();throw new Error('アカウントが変更されました。');}if(!response.ok)throw new Error('ログアウトできませんでした。');invalidate(true);notifyTabs();show('anonymous');dialog.close();onNotice('ログアウトしました。');});
 const deleteButton=$('account-delete');if(deleteButton)deleteButton.onclick=()=>action(async()=>{
  if(isAdmin)throw new Error('管理者アカウントは削除できません。');
  if(!sessionTag)throw new Error('ログインが必要です。');
  if(!window.confirm('アカウント、あとで聴く、再生履歴を削除します。元に戻せません。続けますか？'))return;
  const tag=sessionTag,version=stateVersion,headers={'X-Account-Session':tag};
  const client=await webauthn(),options=await api('/api/account/delete/options',{},headers);
  if(version!==stateVersion||tag!==sessionTag)throw new Error('アカウントが変更されました。');
  const response=await client.startAuthentication({optionsJSON:options});
  if(version!==stateVersion||tag!==sessionTag)throw new Error('アカウントが変更されました。');
  await api('/api/account/delete/finish',response,headers);
  if(version!==stateVersion||tag!==sessionTag){changedElsewhere();return;}
  invalidate(true);notifyTabs();show('anonymous');dialog.close();onNotice('アカウントを削除しました。端末に保存されたパスキーは、端末の設定から削除できます。');
 });
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
  async clearHistory(){
   const tag=sessionTag,version=stateVersion;if(!tag)throw new Error('ログインが必要です。');
   const response=await fetch('/api/account/history',{method:'DELETE',headers:{'X-Account-Session':tag},credentials:'same-origin',cache:'no-store'});
   if((response.status===401||response.status===409)&&version===stateVersion&&tag===sessionTag)changedElsewhere();
   if(!response.ok)throw new Error('再生履歴を削除できませんでした。接続を確認してください。');
   notifyTabs();
   if(tag!==(sessionTag||refreshTag))throw new Error('履歴は削除されましたが、アカウントが変更されました。');
   invalidate();try{await refresh();}catch{throw new Error('履歴は削除されましたが、画面を更新できませんでした。再読み込みしてください。');}
  },
  canWritePosition:()=>!!(sessionTag||refreshTag)&&Number.isSafeInteger(historyGeneration??refreshGeneration),
  async setFavorite(id,enabled){return write('/api/account/favorite',{episodeId:id,enabled});},
  async setPosition(id,positionSeconds,writerId,sequence,keepalive=false){const generation=historyGeneration??refreshGeneration;if(!Number.isSafeInteger(generation))throw new Error('再生履歴を確認できませんでした。');return write('/api/account/history',{episodeId:id,positionSeconds,writerId,sequence,historyGeneration:generation},keepalive,true);}
 };
}
