import {test} from 'node:test';
import assert from 'node:assert/strict';

test('preview access fragments are removed even when the app is already authorized',async()=>{
 const urls=[];globalThis.location={hash:'#preview-access=secret&view=recent',pathname:'/',search:'?source=test'};globalThis.history={state:{page:1},replaceState:(state,title,url)=>urls.push(url)};
 await import('../public/account-ui.js?test=preview-access-fragment');
 assert.deepEqual(urls,['/?source=test#view=recent']);
});

test('email confirmation and recovery fragments are still removed when mixed with preview access',async()=>{
 for(const kind of ['confirm-email','recover-account']){
  const urls=[];globalThis.location={hash:`#preview-access=secret&${kind}=${'a'.repeat(64)}`,pathname:'/',search:''};globalThis.history={state:null,replaceState:(state,title,url)=>urls.push(url)};
  await import(`../public/account-ui.js?test=mixed-${kind}`);
  assert.deepEqual(urls,['/']);
 }
});
