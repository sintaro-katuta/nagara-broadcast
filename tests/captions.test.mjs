import test from 'node:test';
import assert from 'node:assert/strict';
import {timingSafeEqual} from 'node:crypto';
import {makeCaptions,validateCaptions} from '../lib/captions.mjs';

test('字幕は無音とジングルを含む番組の時間に同期する',()=>{
 assert.deepEqual(makeCaptions([{text:'一言目',duration:3,pauseMs:200},{text:'二言目',duration:2,pauseMs:0}],{intro:2,splitIndex:1,transition:1.5}),[{start:2,end:4.8,text:'一言目'},{start:6.5,end:8.5,text:'二言目'}]);
});
test('不正または重複する字幕を拒否する',()=>{
 for(const cues of [[{start:0,end:1,text:''}],[{start:0,end:2,text:'a'},{start:1,end:3,text:'b'}],[{start:0,end:NaN,text:'a'}]])assert.throws(()=>validateCaptions(cues));
});

test('公開 API は認証された字幕だけを保存し、未作成時は 404 を返す',async()=>{
 crypto.subtle.timingSafeEqual=(a,b)=>timingSafeEqual(Buffer.from(a),Buffer.from(b));
 const {default:worker}=await import('../cloudflare/worker.mjs');
 const objects=new Map();
 const env={UPLOAD_SECRET:'x'.repeat(32),DB:{prepare(){return {bind(){return {first:async()=>({id:'daily-2026-11-24'})}}}}},AUDIO:{get:async key=>objects.has(key)?{body:objects.get(key)}:null,put:async(key,body)=>objects.set(key,body)}};
 const url='https://example.com/api/episodes/daily-2026-11-24/captions';
 assert.equal((await worker.fetch(new Request(url),env)).status,404);
 assert.equal((await worker.fetch(new Request(url,{method:'PUT',body:'[]'}),env)).status,401);
 assert.equal((await worker.fetch(new Request(url,{method:'PUT',headers:{Authorization:'Bearer '+env.UPLOAD_SECRET},body:'invalid'}),env)).status,400);
 const cues=[{start:2,end:4,text:'こんにちは'}];
 assert.equal((await worker.fetch(new Request(url,{method:'PUT',headers:{Authorization:'Bearer '+env.UPLOAD_SECRET},body:JSON.stringify(cues)}),env)).status,200);
 assert.deepEqual(await (await worker.fetch(new Request(url),env)).json(),cues);
});
