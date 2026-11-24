import {test} from 'node:test';
import assert from 'node:assert/strict';

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
  if(path==='/api/account')return signed?Response.json({favorites:['ep'],history:[],sessionTag:'1'.repeat(64)}):new Response(null,{status:401});
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
 assert.equal(ui.isSignedIn(),true);assert.deepEqual(sessions.at(-1),{favorites:['ep'],history:[],sessionTag:'1'.repeat(64)});
 assert.equal(dialog.open,false);assert.ok(notices.length);
});

test('account data writes clear the session when authentication expires',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));
 elements['account-dialog'].querySelectorAll=()=>Object.values(elements);
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};
 globalThis.BroadcastChannel=undefined;globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 const sessions=[];let expired=false;
 globalThis.fetch=async(path)=>path==='/api/auth/status'?Response.json({available:true}):path==='/api/account'&&!expired?Response.json({favorites:['ep'],history:[],sessionTag:'1'.repeat(64)}):new Response(null,{status:401});
 const {makeAccountUI}=await import('../public/account-ui.js?test=expiry');
 const ui=makeAccountUI({onSession:value=>sessions.push(value),onNotice(){}});await ui.init();
 assert.equal(ui.isSignedIn(),true);
 expired=true;
 await assert.rejects(ui.setFavorite('ep',false));
 assert.equal(ui.isSignedIn(),false);assert.equal(sessions.at(-1),null);
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
  if(path==='/api/account')return Response.json({favorites:[active],history:[],sessionTag:active.repeat(64)});
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
 respond(Response.json({favorites:[],history:[{episode_id:'ep',position_seconds:37}],sessionTag:'1'.repeat(64)}));await init;
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
 globalThis.fetch=async(path)=>{if(offline)throw new Error('offline');return path==='/api/auth/status'?Response.json({available:true}):Response.json({favorites:[],history:[{episode_id:'ep',position_seconds:37}],sessionTag:'1'.repeat(64)});};
 const {makeAccountUI}=await import('../public/account-ui.js?test=retry');const ui=makeAccountUI({onSession:(value,ready)=>states.push({value,ready}),onNotice(){}});
 await ui.init();assert.deepEqual(states,[]);offline=false;await ui.open();
 assert.equal(dialog.open,true);assert.equal(ui.isSignedIn(),true);assert.equal(states.at(-1).value.history[0].position_seconds,37);assert.equal(states.at(-1).ready,true);
});

test('an account request failure retries on network recovery',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 const events={};globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={addEventListener:(name,fn)=>{events[name]=fn}};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let failing=true;const states=[];globalThis.fetch=async(path)=>path==='/api/auth/status'?Response.json({available:true}):failing?new Response(null,{status:503}):Response.json({favorites:[],history:[],sessionTag:'1'.repeat(64)});
 const {makeAccountUI}=await import('../public/account-ui.js?test=online-retry');const ui=makeAccountUI({onSession:(value,ready)=>states.push({value,ready}),onNotice(){}});
 await ui.init();assert.deepEqual(states,[]);failing=false;events.online();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(ui.isSignedIn(),true);assert.equal(states.at(-1).ready,true);
});

test('a failed WebAuthn script load can be retried without reloading the page',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));const dialog=elements['account-dialog'];dialog.querySelectorAll=()=>[];dialog.close=()=>{};
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;
 globalThis.window={SimpleWebAuthnBrowser:{async startAuthentication(){return {id:'response'}}}};
 let scripts=0,signed=false;globalThis.document={getElementById:id=>elements[id],addEventListener(){},createElement:()=>({}),head:{append(script){scripts++;queueMicrotask(()=>scripts===1?script.onerror():script.onload())}}};
 globalThis.fetch=async(path)=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account')return signed?Response.json({favorites:[],history:[],sessionTag:'1'.repeat(64)}):new Response(null,{status:401});if(path==='/api/auth/passkey/options')return Response.json({challenge:'test'});if(path==='/api/auth/passkey/verify'){signed=true;return Response.json({ok:true});}throw new Error('unexpected path');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=webauthn-retry');const ui=makeAccountUI({onSession(){},onNotice(){}});await ui.init();
 await elements['account-signin'].onclick();assert.equal(scripts,1);assert.equal(ui.isSignedIn(),false);
 await elements['account-signin'].onclick();assert.equal(scripts,2);assert.equal(ui.isSignedIn(),true);
});

test('revalidation discards an older account response after a favorite write',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let accountCalls=0,oldResponse;const old=new Promise(resolve=>{oldResponse=resolve});const states=[];
 globalThis.fetch=async(path)=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account/favorite')return new Response(null,{status:200});if(path==='/api/account'){accountCalls++;if(accountCalls===2)return old;return Response.json({favorites:accountCalls===1?[]:['ep'],history:[],sessionTag:'1'.repeat(64)});}throw new Error('unexpected path');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=revalidate');const ui=makeAccountUI({onSession:value=>states.push(value),onNotice(){}});await ui.init();
 const write=ui.setFavorite('ep',true);ui.revalidate();await write;ui.revalidate();
 await new Promise(resolve=>setTimeout(resolve,0));oldResponse(Response.json({favorites:[],history:[],sessionTag:'1'.repeat(64)}));await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(states.at(-1).favorites,['ep']);
});

test('position checkpoints during revalidation use the previous session and refresh after saving',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let accountCalls=0,completeOldGet;const oldGet=new Promise(resolve=>{completeOldGet=resolve});const requests=[],states=[];
 globalThis.fetch=async(path,options={})=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account/history'){requests.push(options);return new Response(null,{status:200});}if(path==='/api/account'){accountCalls++;if(accountCalls===2)return oldGet;return Response.json({favorites:[],history:[{episode_id:'ep',position_seconds:accountCalls===1?10:45}],sessionTag:'1'.repeat(64)});}throw new Error('unexpected path');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=position-refresh');const {createPositionWriter}=await import('../public/player-model.js');
 const ui=makeAccountUI({onSession:value=>states.push(value),onNotice(){}});await ui.init();ui.revalidate();assert.equal(ui.isSignedIn(),false);
 const send=createPositionWriter(ui,'writer-1234567890',()=>assert.fail('unexpected write failure'));await send('ep',45);
 assert.equal(requests[0].headers['X-Account-Session'],'1'.repeat(64));assert.equal(JSON.parse(requests[0].body).positionSeconds,45);
 await new Promise(resolve=>setTimeout(resolve,0));completeOldGet(Response.json({favorites:[],history:[{episode_id:'ep',position_seconds:10}],sessionTag:'1'.repeat(64)}));await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(states.at(-1).history[0].position_seconds,45);
});

test('a changed session rejects an old checkpoint while account data is refreshing',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));elements['account-dialog'].querySelectorAll=()=>[];
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};globalThis.BroadcastChannel=undefined;globalThis.window={};globalThis.document={getElementById:id=>elements[id],addEventListener(){}};
 let accountCalls=0,completeOldGet;const oldGet=new Promise(resolve=>{completeOldGet=resolve});let writeTag;
 globalThis.fetch=async(path,options={})=>{if(path==='/api/auth/status')return Response.json({available:true});if(path==='/api/account/history'){writeTag=options.headers['X-Account-Session'];return new Response(null,{status:409});}if(path==='/api/account'){accountCalls++;if(accountCalls===2)return oldGet;return Response.json({favorites:[],history:[],sessionTag:(accountCalls===1?'a':'b').repeat(64)});}throw new Error('unexpected path');};
 const {makeAccountUI}=await import('../public/account-ui.js?test=position-account-switch');const ui=makeAccountUI({onSession(){},onNotice(){}});await ui.init();ui.revalidate();
 await assert.rejects(ui.setPosition('ep',45,'writer-1234567890',1));assert.equal(writeTag,'a'.repeat(64));
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(ui.isSignedIn(),true);completeOldGet(Response.json({favorites:[],history:[],sessionTag:'a'.repeat(64)}));
});
