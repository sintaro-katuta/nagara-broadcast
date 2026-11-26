import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHistoryWriteGuard,createPositionWriter} from '../public/player-model.js';

test('administrator recovery resumes in the same browser and waits for operator approval',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout','account-admin-recovery-wait','account-admin-recovery-code','account-admin-recovery-copy','account-admin-recovery-continue','account-admin-recover-toggle'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:true,disabled:false,textContent:'',focus(){},reset(){}}])),dialog=elements['account-dialog'];dialog.open=false;dialog.showModal=function(){this.open=true};dialog.close=function(){this.open=false};dialog.querySelectorAll=()=>[];
 globalThis.location={hash:'#admin-recovery='+'d'.repeat(64),pathname:'/',search:''};globalThis.history={state:null,replaceState(){location.hash=''}};globalThis.BroadcastChannel=undefined;
 globalThis.window={SimpleWebAuthnBrowser:{async startRegistration(){return {id:'new-key'}}}};globalThis.document={getElementById:id=>elements[id],addEventListener(){},createElement:()=>({}),head:{append(script){queueMicrotask(()=>script.onload())}}};
 let pending=false,approved=false,signed=false;globalThis.fetch=async(path)=>{if(path==='/api/auth/status')return Response.json({available:true,adminRecoveryAvailable:true});if(path==='/api/account')return signed?Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:'a'.repeat(64)}):new Response(null,{status:401});if(path==='/api/auth/admin-recovery/confirm'){pending=true;return Response.json({approvalCode:'b'.repeat(64)})}if(path==='/api/auth/admin-recovery/status')return pending?Response.json({approvalCode:'b'.repeat(64)}):new Response(null,{status:401});if(path==='/api/auth/admin-recovery/options')return approved?Response.json({challenge:'test'}):new Response(null,{status:409});if(path==='/api/auth/admin-recovery/finish'){signed=true;pending=false;return Response.json({ok:true});}throw new Error('unexpected request '+path);};
 const first=await import('../public/account-ui.js?test=admin-recover-link');const ui=first.makeAccountUI({onSession(){},onNotice(){}});await ui.init();assert.equal(dialog.open,true);assert.equal(location.hash,'');await elements['account-confirm-button'].onclick();assert.equal(elements['account-admin-recovery-code'].textContent,'b'.repeat(64));
 dialog.close();const resumed=await import('../public/account-ui.js?test=admin-recover-resume');const ui2=resumed.makeAccountUI({onSession(){},onNotice(){}});await ui2.init();assert.equal(dialog.open,true);assert.equal(elements['account-admin-recovery-wait'].hidden,false);
 await elements['account-admin-recovery-continue'].onclick();assert.match(elements['account-message'].textContent,/確認後/);assert.equal(signed,false);
 approved=true;await elements['account-admin-recovery-continue'].onclick();assert.equal(ui2.isSignedIn(),true);assert.equal(dialog.open,false);assert.equal(elements['account-admin-recovery-code'].textContent,'');
});

test('administrator setup shows only the signed-in account code when enabled',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout','account-admin-setup-section','account-admin-setup-code','account-admin-setup-result'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:true,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};globalThis.BroadcastChannel=undefined;
 globalThis.fetch=async(path,options={})=>{if(path==='/api/auth/status')return Response.json({available:true,adminSetupAvailable:true});if(path==='/api/account')return Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:'a'.repeat(64)});assert.equal(path,'/api/account/admin-setup-code');assert.equal(options.headers['X-Account-Session'],'a'.repeat(64));return Response.json({code:'b'.repeat(22)});};
 const {makeAccountUI}=await import('../public/account-ui.js?test=admin-setup');const ui=makeAccountUI({onSession(){},onNotice(){}});await ui.init();assert.equal(elements['account-admin-setup-section'].hidden,false);await elements['account-admin-setup-code'].onclick();assert.equal(elements['account-admin-setup-result'].textContent,'b'.repeat(22));ui.revalidate();assert.equal(elements['account-admin-setup-result'].textContent,'');
});

test('adding a backup passkey first verifies the existing passkey and keeps the session binding',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout','account-add-passkey','account-add-passkey-section'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:true,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;
 const actions=[];globalThis.window={SimpleWebAuthnBrowser:{async startAuthentication(){actions.push('authenticate');return {id:'existing'}},async startRegistration(){actions.push('register');return {id:'new'}}}};
 globalThis.document={getElementById:id=>elements[id],addEventListener(){},createElement:()=>({}),head:{append(script){queueMicrotask(()=>script.onload())}}};
 const calls=[];globalThis.fetch=async(path,options={})=>{if(path==='/api/auth/status')return Response.json({available:true,passkeyAddAvailable:true});if(path==='/api/account')return Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:'a'.repeat(64)});calls.push(path);assert.equal(options.headers['X-Account-Session'],'a'.repeat(64));return Response.json({challenge:'test'});};
 const {makeAccountUI}=await import('../public/account-ui.js?test=add-passkey');const ui=makeAccountUI({onSession(){},onNotice(){}});await ui.init();assert.equal(elements['account-add-passkey-section'].hidden,false);await elements['account-add-passkey'].onclick();
 assert.deepEqual(actions,['authenticate','register']);assert.deepEqual(calls,['/api/auth/passkey/register/reauth-options','/api/auth/passkey/register/reauth-verify','/api/auth/passkey/register/options','/api/auth/passkey/register/verify']);assert.match(elements['account-message'].textContent,/追加しました/);
});

test('a paused tab cannot restore deleted history after receiving a new generation',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};globalThis.BroadcastChannel=undefined;
 let generation=0;const writes=[];globalThis.fetch=async(path,options={})=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account')return Response.json({favorites:[],history:[],historyGeneration:generation,sessionTag:'a'.repeat(64)});if(path==='/api/account/history'){writes.push(JSON.parse(options.body));return Response.json({ok:true});}throw new Error('unexpected request');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=paused-tab-clear');const guard=createHistoryWriteGuard();let hasCurrent=false;
 const ui=makeAccountUI({onSession:data=>guard.observeSession(data,true,hasCurrent),onNotice(){}});await ui.init();hasCurrent=true;generation=1;ui.revalidate();await new Promise(resolve=>setTimeout(resolve,0));
 const write=createPositionWriter(ui,'writer-1234567890',()=>assert.fail('unexpected error'));
 if(guard.canWrite())await write('ep',45,true);assert.deepEqual(writes,[]);
 guard.resume();if(guard.canWrite())await write('ep',46);assert.equal(writes.length,1);assert.equal(writes[0].historyGeneration,1);
});

test('clearing history refreshes the session, preserves favorites and notifies other tabs',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 const events=[];globalThis.BroadcastChannel=class{postMessage(value){events.push(value)}};
 let cleared=false;globalThis.fetch=async(path,options={})=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account')return Response.json({favorites:['saved'],history:cleared?[]:[{episode_id:'ep',position_seconds:42}],historyGeneration:cleared?1:0,sessionTag:'a'.repeat(64)});if(path==='/api/account/history'){assert.equal(options.method,'DELETE');assert.equal(options.headers['X-Account-Session'],'a'.repeat(64));cleared=true;return Response.json({ok:true});}throw new Error('unexpected request');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=clear-history');const sessions=[];const ui=makeAccountUI({onSession:value=>sessions.push(value),onNotice(){}});await ui.init();await ui.clearHistory();
 assert.deepEqual(sessions.at(-1).history,[]);assert.deepEqual(sessions.at(-1).favorites,['saved']);assert.equal(sessions.at(-1).historyGeneration,1);assert.deepEqual(events,['changed']);
});

test('a failed history deletion does not claim success or erase the current session',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};globalThis.BroadcastChannel=undefined;
 globalThis.fetch=async(path)=>path==='/api/auth/status'?Response.json({available:true}):path==='/api/account'?Response.json({favorites:[],history:[{episode_id:'ep'}],historyGeneration:0,sessionTag:'a'.repeat(64)}):new Response(null,{status:500});
 const {makeAccountUI}=await import('../public/account-ui.js?test=clear-history-failure');const sessions=[];const ui=makeAccountUI({onSession:value=>sessions.push(value),onNotice(){}});await ui.init();await assert.rejects(ui.clearHistory(),/削除できませんでした/);assert.equal(ui.isSignedIn(),true);assert.equal(sessions.at(-1).history.length,1);
});

test('history deletion refreshes and notifies after overlapping revalidation',async()=>{
 for(const order of ['revalidation-first','delete-first']){
  const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
  const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
  globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
  const events=[];globalThis.BroadcastChannel=class{postMessage(value){events.push(value)}};
  let finishDelete,finishOldGet,cleared=false,reads=0;const deletePending=new Promise(resolve=>{finishDelete=resolve}),oldGet=new Promise(resolve=>{finishOldGet=resolve});
  const data=history=>Response.json({favorites:['saved'],history,historyGeneration:history.length?0:1,sessionTag:'a'.repeat(64)}),oldHistory=[{episode_id:'ep',position_seconds:42}];
  globalThis.fetch=async(path,options={})=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account'){reads++;if(reads===2&&order==='delete-first')return oldGet;return data(cleared?[]:oldHistory);}if(path==='/api/account/history'&&options.method==='DELETE'){await deletePending;cleared=true;return Response.json({ok:true});}throw new Error('unexpected request');};
  const {makeAccountUI}=await import('../public/account-ui.js?test=clear-race-'+order);const sessions=[];const ui=makeAccountUI({onSession:value=>sessions.push(value),onNotice(){}});await ui.init();const deleting=ui.clearHistory();ui.revalidate();
  if(order==='revalidation-first')await new Promise(resolve=>setTimeout(resolve,0));
  finishDelete();await deleting;
  if(order==='delete-first'){finishOldGet(data(oldHistory));await new Promise(resolve=>setTimeout(resolve,0));}
  assert.deepEqual(sessions.at(-1).history,[]);assert.deepEqual(sessions.at(-1).favorites,['saved']);assert.equal(sessions.at(-1).historyGeneration,1);assert.deepEqual(events,['changed']);
 }
});

test('successful deletion does not overwrite a different account selected while waiting',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 const events=[];globalThis.BroadcastChannel=class{postMessage(value){events.push(value)}};
 let finishDelete,tag='a';const pending=new Promise(resolve=>{finishDelete=resolve});
 globalThis.fetch=async(path,options={})=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account')return Response.json({favorites:[tag],history:[],historyGeneration:0,sessionTag:tag.repeat(64)});if(path==='/api/account/history'&&options.method==='DELETE'){await pending;return Response.json({ok:true});}throw new Error('unexpected request');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=clear-account-switch');const sessions=[];const ui=makeAccountUI({onSession:value=>sessions.push(value),onNotice(){}});await ui.init();const deleting=ui.clearHistory();tag='b';ui.revalidate();await new Promise(resolve=>setTimeout(resolve,0));finishDelete();
 await assert.rejects(deleting,/履歴は削除されましたが、アカウントが変更/);assert.deepEqual(sessions.at(-1).favorites,['b']);assert.equal(ui.isSignedIn(),true);assert.deepEqual(events,['changed']);
});

test('recovery explains an already registered passkey and permits retry',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));
 const dialog=elements['account-dialog'];dialog.open=false;dialog.showModal=function(){this.open=true};dialog.close=function(){this.open=false};dialog.querySelectorAll=()=>Object.values(elements);
 globalThis.location={hash:'#recover-account='+'a'.repeat(64),pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;
 let attempts=0,signed=false;globalThis.window={SimpleWebAuthnBrowser:{async startRegistration(){if(++attempts===1)throw Object.assign(new Error('The authenticator was previously registered'),{name:'InvalidStateError',code:'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'});return {id:'new-key'};}}};
 globalThis.document={getElementById:id=>elements[id],addEventListener(){},createElement:()=>({}),head:{append(script){queueMicrotask(()=>script.onload())}}};
 let finishes=0;globalThis.fetch=async path=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account')return signed?Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:'1'.repeat(64)}):new Response(null,{status:401});if(path==='/api/auth/recovery/confirm')return Response.json({ok:true});if(path==='/api/auth/recovery/options')return Response.json({challenge:'test'});if(path==='/api/auth/recovery/finish'){finishes++;signed=true;return Response.json({ok:true});}throw new Error('unexpected path '+path);};
 const {makeAccountUI}=await import('../public/account-ui.js?test=recovery-duplicate');const ui=makeAccountUI({onSession(){},onNotice(){}});await ui.init();await elements['account-confirm-button'].onclick();await elements['account-create-button'].onclick();
 assert.match(elements['account-message'].textContent,/登録済み.*別のパスキーの保存先/);assert.equal(finishes,0);assert.equal(elements['account-create'].hidden,false);
 await elements['account-create-button'].onclick();assert.equal(finishes,1);assert.equal(ui.isSignedIn(),true);
});

test('email link is removed from history and consumed only after user confirmation',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',value:'',focus(){},reset(){this.value=''}}]));
 const dialog=elements['account-dialog'];dialog.open=false;dialog.showModal=function(){this.open=true};dialog.close=function(){this.open=false};dialog.querySelectorAll=()=>Object.values(elements);
 const token='a'.repeat(64),requests=[],sessions=[],notices=[];let fragmentCleared=false,signed=false;
 globalThis.location={hash:'#confirm-email='+token,pathname:'/',search:''};
 globalThis.history={state:null,replaceState(_state,_title,url){fragmentCleared=true;assert.equal(url,'/')}};
 globalThis.window={SimpleWebAuthnBrowser:{async startRegistration(){return {id:'response'}}}};
 globalThis.BroadcastChannel=undefined;
 globalThis.document={getElementById:id=>elements[id],addEventListener(){},createElement:()=>({}),head:{append(script){queueMicrotask(()=>script.onload())}}};
 globalThis.fetch=async(path,options={})=>{
  requests.push({path,body:options.body});
  if(path==='/api/auth/status')return Response.json({available:true});
  if(path==='/api/account')return signed?Response.json({favorites:['ep'],history:[],historyGeneration:0,sessionTag:'1'.repeat(64)}):new Response(null,{status:401});
  if(path==='/api/auth/enroll/confirm')return Response.json({ok:true});
  if(path==='/api/auth/enroll/options')return Response.json({challenge:'test'});
  if(path==='/api/auth/enroll/finish'){signed=true;return Response.json({ok:true});}
  throw new Error('unexpected path '+path);
 };
 const {makeAccountUI}=await import('../public/account-ui.js?test=confirmation');
 assert.equal(fragmentCleared,true);
 const ui=makeAccountUI({onSession:value=>sessions.push(value),onNotice:value=>notices.push(value)});
 await ui.init();assert.equal(dialog.open,true);assert.equal(requests.some(x=>x.path.endsWith('/confirm')),false);
 dialog.close();ui.open();assert.equal(elements['account-confirm'].hidden,false);
 await elements['account-confirm-button'].onclick();
 assert.equal(JSON.parse(requests.find(x=>x.path.endsWith('/confirm')).body).token,token);
 assert.equal(elements['account-create'].hidden,false);
 dialog.close();ui.open();assert.equal(elements['account-create'].hidden,false);
 await elements['account-create-button'].onclick();
 assert.equal(ui.isSignedIn(),true);assert.deepEqual(sessions.at(-1),{favorites:['ep'],history:[],historyGeneration:0,sessionTag:'1'.repeat(64)});
 assert.equal(dialog.open,false);assert.ok(notices.length);
});

test('account data writes clear the session when authentication expires',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));
 elements['account-dialog'].querySelectorAll=()=>Object.values(elements);
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};
 globalThis.BroadcastChannel=undefined;globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 const sessions=[];let expired=false;
 globalThis.fetch=async(path)=>path==='/api/auth/status'?Response.json({available:true}):path==='/api/account'&&!expired?Response.json({favorites:['ep'],history:[],historyGeneration:0,sessionTag:'1'.repeat(64)}):new Response(null,{status:401});
 const {makeAccountUI}=await import('../public/account-ui.js?test=expiry');
 const ui=makeAccountUI({onSession:value=>sessions.push(value),onNotice(){}});await ui.init();
 assert.equal(ui.isSignedIn(),true);
 expired=true;
 await assert.rejects(ui.setFavorite('ep',false));
 assert.equal(ui.isSignedIn(),false);assert.equal(sessions.at(-1),null);
});

test('stale history writes refresh the generation before later writes',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let generation=0;const writes=[];globalThis.fetch=async(path,options={})=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account')return Response.json({favorites:[],history:[],historyGeneration:generation,sessionTag:'1'.repeat(64)});if(path==='/api/account/history'){const body=JSON.parse(options.body);writes.push(body);return new Response(null,{status:body.historyGeneration===generation?200:409})}throw new Error('unexpected request');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=history-generation');const ui=makeAccountUI({onSession(){},onNotice(){}});await ui.init();generation=1;
 await assert.rejects(ui.setPosition('ep',10,'writer-1234567890',1));await new Promise(resolve=>setTimeout(resolve,0));
 await ui.setPosition('ep',20,'writer-1234567890',2);assert.deepEqual(writes.map(x=>x.historyGeneration),[0,1]);
});

test('session changes invalidate stale state, and final position sends immediately with keepalive',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>Object.values(elements);
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};
 globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let channel;globalThis.BroadcastChannel=class{constructor(){channel=this}postMessage(){}};
 const sessions=[],calls=[];let active='a';
 globalThis.fetch=async(path,options={})=>{
  calls.push({path,options});
  if(path==='/api/auth/status')return Response.json({available:true});
  if(path==='/api/account')return Response.json({favorites:[active],history:[],historyGeneration:0,sessionTag:active.repeat(64)});
  if(path==='/api/account/history')return new Response(null,{status:200});
  if(path==='/api/account/favorite')return new Response(null,{status:409});
  throw new Error('unexpected path');
 };
 const {makeAccountUI}=await import('../public/account-ui.js?test=tab-change');
 const ui=makeAccountUI({onSession:value=>sessions.push(value),onNotice(){}});await ui.init();
 const pending=ui.setPosition('ep',42,'writer-1234567890',7,true);
 const request=calls.find(x=>x.path==='/api/account/history');assert.equal(request.options.keepalive,true);assert.equal(request.options.headers['X-Account-Session'],'a'.repeat(64));assert.equal(JSON.parse(request.options.body).sequence,7);await pending;
 active='b';await assert.rejects(ui.setFavorite('ep',true));
 assert.ok(sessions.includes(null));
 await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(sessions.at(-1).favorites,['b']);
 active='c';channel.onmessage({data:'changed'});assert.equal(sessions.at(-1),null);
 await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(sessions.at(-1).favorites,['c']);
});

test('account readiness waits for a definitive response and remains pending on failure',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;
 globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let respond;const pending=new Promise(resolve=>{respond=resolve});const states=[];
 globalThis.fetch=async(path)=>path==='/api/auth/status'?Response.json({available:true}):pending;
 const {makeAccountUI}=await import('../public/account-ui.js?test=readiness');
 const ui=makeAccountUI({onSession:(value,ready)=>states.push({value,ready}),onNotice(){}});
 const init=ui.init();await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(states,[]);
 respond(Response.json({favorites:[],history:[{episode_id:'ep',position_seconds:37}],historyGeneration:0,sessionTag:'1'.repeat(64)}));await init;
 assert.equal(states.at(-1).ready,true);assert.equal(states.at(-1).value.history[0].position_seconds,37);
 const failed=[];globalThis.fetch=async()=>{throw new Error('offline')};
 await makeAccountUI({onSession:(value,ready)=>failed.push({value,ready}),onNotice(){}}).init();assert.deepEqual(failed,[]);
 const anonymous=[];globalThis.fetch=async(path)=>path==='/api/auth/status'?Response.json({available:true}):new Response(null,{status:401});
 await makeAccountUI({onSession:(value,ready)=>anonymous.push({value,ready}),onNotice(){}}).init();assert.deepEqual(anonymous,[{value:null,ready:true}]);
});

test('initialization retries after a transient failure when the user opens the account screen',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));
 const dialog=elements['account-dialog'];dialog.querySelectorAll=()=>[];dialog.showModal=function(){this.open=true};
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let offline=true;const states=[];
 globalThis.fetch=async(path)=>{if(offline)throw new Error('offline');return path==='/api/auth/status'?Response.json({available:true}):Response.json({favorites:[],history:[{episode_id:'ep',position_seconds:37}],historyGeneration:0,sessionTag:'1'.repeat(64)});};
 const {makeAccountUI}=await import('../public/account-ui.js?test=retry');const ui=makeAccountUI({onSession:(value,ready)=>states.push({value,ready}),onNotice(){}});
 await ui.init();assert.deepEqual(states,[]);offline=false;await ui.open();
 assert.equal(dialog.open,true);assert.equal(ui.isSignedIn(),true);assert.equal(states.at(-1).value.history[0].position_seconds,37);assert.equal(states.at(-1).ready,true);
});

test('an account request failure retries on network recovery',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 const events={};globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={addEventListener:(name,fn)=>{events[name]=fn}};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let failing=true;const states=[];globalThis.fetch=async(path)=>path==='/api/auth/status'?Response.json({available:true}):failing?new Response(null,{status:503}):Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:'1'.repeat(64)});
 const {makeAccountUI}=await import('../public/account-ui.js?test=online-retry');const ui=makeAccountUI({onSession:(value,ready)=>states.push({value,ready}),onNotice(){}});
 await ui.init();assert.deepEqual(states,[]);failing=false;events.online();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(ui.isSignedIn(),true);assert.equal(states.at(-1).ready,true);
});

test('a failed WebAuthn script load can be retried without reloading the page',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));const dialog=elements['account-dialog'];dialog.querySelectorAll=()=>[];dialog.close=()=>{};
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;
 globalThis.window={SimpleWebAuthnBrowser:{async startAuthentication(){return {id:'response'}}}};
 let scripts=0,signed=false;globalThis.document={getElementById:id=>elements[id],addEventListener(){},createElement:()=>({}),head:{append(script){scripts++;queueMicrotask(()=>scripts===1?script.onerror():script.onload())}}};
 globalThis.fetch=async(path)=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account')return signed?Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:'1'.repeat(64)}):new Response(null,{status:401});if(path==='/api/auth/passkey/options')return Response.json({challenge:'test'});if(path==='/api/auth/passkey/verify'){signed=true;return Response.json({ok:true});}throw new Error('unexpected path');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=webauthn-retry');const ui=makeAccountUI({onSession(){},onNotice(){}});await ui.init();
 await elements['account-signin'].onclick();assert.equal(scripts,1);assert.equal(ui.isSignedIn(),false);
 await elements['account-signin'].onclick();assert.equal(scripts,2);assert.equal(ui.isSignedIn(),true);
});

test('revalidation discards an older account response after a favorite write',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let accountCalls=0,oldResponse;const old=new Promise(resolve=>{oldResponse=resolve});const states=[];
 globalThis.fetch=async(path)=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account/favorite')return new Response(null,{status:200});if(path==='/api/account'){accountCalls++;if(accountCalls===2)return old;return Response.json({favorites:accountCalls===1?[]:['ep'],history:[],historyGeneration:0,sessionTag:'1'.repeat(64)});}throw new Error('unexpected path');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=revalidate');const ui=makeAccountUI({onSession:value=>states.push(value),onNotice(){}});await ui.init();
 const write=ui.setFavorite('ep',true);ui.revalidate();await write;ui.revalidate();
 await new Promise(resolve=>setTimeout(resolve,0));oldResponse(Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:'1'.repeat(64)}));await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(states.at(-1).favorites,['ep']);
});

test('position checkpoints during revalidation use the previous session and refresh after saving',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let accountCalls=0,completeOldGet;const oldGet=new Promise(resolve=>{completeOldGet=resolve});const requests=[],states=[];
 globalThis.fetch=async(path,options={})=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account/history'){requests.push(options);return new Response(null,{status:200});}if(path==='/api/account'){accountCalls++;if(accountCalls===2)return oldGet;return Response.json({favorites:[],history:[{episode_id:'ep',position_seconds:accountCalls===1?10:45}],historyGeneration:0,sessionTag:'1'.repeat(64)});}throw new Error('unexpected path');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=position-refresh');const {createPositionWriter}=await import('../public/player-model.js');
 const ui=makeAccountUI({onSession:value=>states.push(value),onNotice(){}});await ui.init();ui.revalidate();assert.equal(ui.isSignedIn(),false);
 const send=createPositionWriter(ui,'writer-1234567890',()=>assert.fail('unexpected write failure'));await send('ep',45);
 assert.equal(requests[0].headers['X-Account-Session'],'1'.repeat(64));assert.equal(JSON.parse(requests[0].body).positionSeconds,45);
 completeOldGet(Response.json({favorites:[],history:[{episode_id:'ep',position_seconds:10}],historyGeneration:0,sessionTag:'1'.repeat(64)}));await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(states.at(-1).history[0].position_seconds,45);
});

test('refresh never publishes a checkpoint read before an overlapping position write',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 for(const order of ['write-first-get-first','write-first-put-first','get-first-write-first']){
  const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
  globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
  let accountCalls=0,completeGet,completePut,serverPosition=10;const get=new Promise(resolve=>{completeGet=resolve}),put=new Promise(resolve=>{completePut=resolve});const states=[];
  globalThis.fetch=async(path)=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account/history'){await put;serverPosition=45;return new Response(null,{status:200});}if(path==='/api/account'){accountCalls++;if(accountCalls===2)return get;return Response.json({favorites:[],history:[{episode_id:'ep',position_seconds:serverPosition}],historyGeneration:0,sessionTag:'1'.repeat(64)});}throw new Error('unexpected path');};
  const {makeAccountUI}=await import('../public/account-ui.js?test=overlap');const ui=makeAccountUI({onSession:value=>states.push(value),onNotice(){}});await ui.init();
  let write;if(order==='get-first-write-first'){ui.revalidate();write=ui.setPosition('ep',45,'writer-1234567890',1);}else{write=ui.setPosition('ep',45,'writer-1234567890',1);ui.revalidate();}
  const stale=()=>Response.json({favorites:[],history:[{episode_id:'ep',position_seconds:10}],historyGeneration:0,sessionTag:'1'.repeat(64)});
  if(order==='write-first-put-first'){completePut();await write;completeGet(stale());}else{completeGet(stale());await new Promise(resolve=>setTimeout(resolve,0));assert.equal(states.at(-1),null,order);completePut();await write;}
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(states.at(-1).history[0].position_seconds,45,order);
 }
});

test('a changed session rejects an old checkpoint while account data is refreshing',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let accountCalls=0,completeOldGet;const oldGet=new Promise(resolve=>{completeOldGet=resolve});let writeTag;
 globalThis.fetch=async(path,options={})=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account/history'){writeTag=options.headers['X-Account-Session'];return new Response(null,{status:409});}if(path==='/api/account'){accountCalls++;if(accountCalls===2)return oldGet;return Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:(accountCalls===1?'a':'b').repeat(64)});}throw new Error('unexpected path');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=position-account-switch');const ui=makeAccountUI({onSession(){},onNotice(){}});await ui.init();ui.revalidate();
 await assert.rejects(ui.setPosition('ep',45,'writer-1234567890',1));assert.equal(writeTag,'a'.repeat(64));
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(ui.isSignedIn(),true);completeOldGet(Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:'a'.repeat(64)}));
});

test('administrator metrics are hidden for non-admins and discarded after a session change',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout','account-admin-open','account-admin-panel','account-admin-storage','account-admin-mail','account-admin-notices','account-admin-refresh'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:true,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let activeAdmin=true,completeMetrics;const metrics=new Promise(resolve=>{completeMetrics=resolve});
 globalThis.fetch=async(path)=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/admin/usage')return metrics;if(path==='/api/account')return Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:(activeAdmin?'a':'b').repeat(64),admin:activeAdmin});throw new Error('unexpected path');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=admin-metrics');const ui=makeAccountUI({onSession(){},onNotice(){}});await ui.init();assert.equal(elements['account-admin-open'].hidden,false);
 const pending=elements['account-admin-open'].onclick();activeAdmin=false;ui.revalidate();assert.equal(elements['account-admin-panel'].hidden,true);
 completeMetrics(Response.json({storage:{count:999,bytes:100},resend:null}));await pending;await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(elements['account-admin-open'].hidden,true);assert.notEqual(elements['account-admin-storage'].textContent.includes('999'),true);
});

test('admin can queue blocked notifications and receives a clear result',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout','account-admin-open','account-admin-panel','account-admin-storage','account-admin-mail','account-admin-notices','account-admin-refresh','account-admin-retry','account-admin-retry-help','account-admin-retry-result'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:true,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let blocked=2,request;
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/auth/status')return Response.json({available:true});
  if(path==='/api/account')return Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:'a'.repeat(64),admin:true});
  if(path==='/api/admin/usage')return Response.json({storage:{count:0,bytes:0},resend:null,notices:{waiting:0,blocked}});
  if(path==='/api/admin/notices/retry'){request=options;blocked=0;return Response.json({queued:2});}
  throw new Error('unexpected path');
 };
 const {makeAccountUI}=await import('../public/account-ui.js?test=admin-retry');const ui=makeAccountUI({onSession(){},onNotice(){}});await ui.init();
 await elements['account-admin-open'].onclick();assert.equal(elements['account-admin-retry'].hidden,false);
 await elements['account-admin-retry'].onclick();assert.equal(request.method,'POST');assert.equal(request.headers['X-Account-Session'],'a'.repeat(64));
 assert.equal(elements['account-admin-retry'].hidden,true);assert.match(elements['account-admin-retry-result'].textContent,/2件を再送待ち/);
});

test('admin sees separate provider quota, application limits and actionable warnings',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout','account-admin-open','account-admin-panel','account-admin-storage','account-admin-mail','account-admin-mail-pools','account-admin-mail-warning','account-admin-notices','account-admin-refresh'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:true,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let provider=null,used=32,blocked=1;
 globalThis.fetch=async(path)=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account')return Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:'a'.repeat(64),admin:true});if(path==='/api/admin/usage')return Response.json({storage:{count:0,bytes:0},resend:provider,notices:{waiting:0,blocked},mailPools:{enroll:{used,limit:40,resetsAt:null},recovery:{used:1,limit:25,resetsAt:null},'admin-recovery':{used:0,limit:5,resetsAt:null}}});throw new Error('unexpected path');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=mail-pools');const ui=makeAccountUI({onSession(){},onNotice(){}});await ui.init();await elements['account-admin-open'].onclick();
 assert.match(elements['account-admin-mail'].textContent,/取得できません/);assert.match(elements['account-admin-mail-pools'].textContent,/登録 32 \/ 40/);assert.match(elements['account-admin-mail-pools'].textContent,/配送数ではありません/);assert.match(elements['account-admin-mail-warning'].textContent,/上限に近づいて/);assert.match(elements['account-admin-mail-warning'].textContent,/確認が必要/);
 used=1;blocked=0;provider={daily:{used:80,limit:100,resetsAt:'2026-11-27T00:00:00Z'},monthly:{used:90,limit:3000,resetsAt:'2026-12-01T00:00:00Z'}};
 await elements['account-admin-refresh'].onclick();assert.match(elements['account-admin-mail'].textContent,/80 \/ 100/);assert.match(elements['account-admin-mail-warning'].textContent,/Resendの送信枠/);assert.doesNotMatch(elements['account-admin-mail-warning'].textContent,/アプリ内/);
 ui.revalidate();assert.equal(elements['account-admin-mail-pools'].textContent,'');assert.equal(elements['account-admin-mail-warning'].textContent,'');
});

test('account deletion requires confirmation and passkey verification',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout','account-delete'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:true,disabled:false,textContent:'',focus(){},reset(){}}]));const dialog=elements['account-dialog'];dialog.querySelectorAll=()=>[];dialog.close=()=>{};
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;
 let confirmed=false;globalThis.window={confirm:()=>confirmed,SimpleWebAuthnBrowser:{startAuthentication:async()=>({id:'credential'})}};
 globalThis.document={getElementById:id=>elements[id],addEventListener(){},createElement:()=>({}),head:{append(script){queueMicrotask(()=>script.onload())}}};
 const calls=[],notices=[];globalThis.fetch=async(path,options={})=>{calls.push({path,options});if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account')return Response.json({favorites:[],history:[],historyGeneration:0,sessionTag:'a'.repeat(64)});if(path==='/api/account/delete/options')return Response.json({challenge:'test'});if(path==='/api/account/delete/finish')return Response.json({ok:true});throw new Error('unexpected path');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=account-delete');const ui=makeAccountUI({onSession(){},onNotice:value=>notices.push(value)});await ui.init();
 await elements['account-delete'].onclick();assert.equal(calls.some(x=>x.path.includes('/delete/')),false);
 confirmed=true;await elements['account-delete'].onclick();assert.equal(calls.find(x=>x.path.endsWith('/finish')).options.headers['X-Account-Session'],'a'.repeat(64));assert.equal(ui.isSignedIn(),false);assert.match(notices.at(-1),/削除しました/);
});
