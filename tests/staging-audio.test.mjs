import {test} from 'node:test';
import assert from 'node:assert/strict';
import staging from '../cloudflare/staging-worker.mjs';

test('preview audio is isolated behind the gate and supports byte ranges',async()=>{
 const origin='https://nagara-auth-staging.sintaro-katuta.workers.dev',token='a'.repeat(64);
 const env={PREVIEW_ONLY:'true',AUTH_ORIGIN:origin,PREVIEW_ACCESS_TOKEN:token,PREVIEW_EXPIRES_AT:String(Math.floor(Date.now()/1000)+3600)};
 const req=headers=>new Request(origin+'/audio/preview-audio-fixture.mp3',{headers});
 assert.equal((await staging.fetch(req({}),env)).status,401);
 const response=await staging.fetch(req({Cookie:`__Host-nagara_preview=${token}`,Range:'bytes=0-43'}),env);
 assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'audio/wav');assert.equal(response.headers.get('content-range'),'bytes 0-43/480044');
 const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(bytes.length,44);assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');
});
