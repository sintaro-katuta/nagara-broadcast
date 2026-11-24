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
 globalThis.document={getElementById:id=>elements[id],createElement:()=>({}),head:{append(script){queueMicrotask(()=>script.onload())}}};
 globalThis.fetch=async(path,options={})=>{
  requests.push({path,body:options.body});
  if(path==='/api/auth/status')return Response.json({available:true});
  if(path==='/api/account')return signed?Response.json({favorites:['ep'],history:[]}):new Response(null,{status:401});
  if(path==='/api/auth/enroll/confirm')return Response.json({ok:true});
  if(path==='/api/auth/enroll/options')return Response.json({challenge:'test'});
  if(path==='/api/auth/enroll/finish'){signed=true;return Response.json({ok:true});}
  throw new Error('unexpected path '+path);
 };
 const {makeAccountUI}=await import('../public/account-ui.js?test=confirmation');
 assert.equal(fragmentCleared,true);
 const ui=makeAccountUI({onSession:value=>sessions.push(value),onNotice:value=>notices.push(value)});
 await ui.init();assert.equal(dialog.open,true);assert.equal(requests.some(x=>x.path.endsWith('/confirm')),false);
 await elements['account-confirm-button'].onclick();
 assert.equal(JSON.parse(requests.find(x=>x.path.endsWith('/confirm')).body).token,token);
 assert.equal(elements['account-create'].hidden,false);
 await elements['account-create-button'].onclick();
 assert.equal(ui.isSignedIn(),true);assert.deepEqual(sessions.at(-1),{favorites:['ep'],history:[]});
 assert.equal(dialog.open,false);assert.ok(notices.length);
});

test('account data writes clear the session when authentication expires',async()=>{
 const names=['account-dialog','account-message','account-anonymous','account-confirm','account-create','account-signed-in','account-close','account-signin','account-register-toggle','account-recover-toggle','account-email-form','account-email-submit','account-email-description','account-email','account-confirm-button','account-create-button','account-logout'];
 const elements=Object.fromEntries(names.map(name=>[name,{hidden:false,disabled:false,textContent:'',focus(){},reset(){}}]));
 elements['account-dialog'].querySelectorAll=()=>Object.values(elements);
 globalThis.location={hash:'',pathname:'/',search:''};globalThis.history={state:null,replaceState(){}};
 globalThis.document={getElementById:id=>elements[id]};
 const sessions=[];
 globalThis.fetch=async(path)=>path==='/api/auth/status'?Response.json({available:true}):path==='/api/account'?Response.json({favorites:['ep'],history:[]}):new Response(null,{status:401});
 const {makeAccountUI}=await import('../public/account-ui.js?test=expiry');
 const ui=makeAccountUI({onSession:value=>sessions.push(value),onNotice(){}});await ui.init();
 assert.equal(ui.isSignedIn(),true);
 await assert.rejects(ui.setFavorite('ep',false));
 assert.equal(ui.isSignedIn(),false);assert.equal(sessions.at(-1),null);
});
