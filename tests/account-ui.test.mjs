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
