import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeResendEmail,getResendUsage} from '../cloudflare/resend-email.mjs';

test('Resend adapter sends to the fixed API endpoint with the server-side key',async(t)=>{
 let request;t.mock.method(globalThis,'fetch',async(url,options)=>{request={url,options};return Response.json({id:'message-id'});});
 const mailer=makeResendEmail('re_test_key_12345');await mailer.send({from:'sender@example.com',to:'user@example.com',subject:'test',text:'hello'},{idempotencyKey:'notice/id'});
 assert.equal(request.url,'https://api.resend.com/emails');assert.equal(request.options.headers.Authorization,'Bearer re_test_key_12345');
 assert.equal(request.options.headers['Idempotency-Key'],'notice/id');assert.equal(JSON.parse(request.options.body).to,'user@example.com');assert.equal(request.options.redirect,'error');
 assert.equal(makeResendEmail('invalid'),null);
});

test('usage exposes only verified quota fields and hides provider errors',async(t)=>{
 let mode='ok',requests=0;t.mock.method(globalThis,'fetch',async(url,options)=>{requests++;assert.equal(url,'https://api.resend.com/usage');assert.equal(options.headers.Authorization,'Bearer re_usage_key_12345');if(mode==='error')return new Response('secret',{status:403});return Response.json({emails:{daily:{used:2,limit:100,resets_at:'2026-11-25T00:00:00Z'},monthly:{used:6,limit:null,resets_at:'2026-12-01T00:00:00Z'}},secret:'not exposed'});});
 const result=await getResendUsage('re_usage_key_12345');assert.deepEqual(result,{daily:{used:2,limit:100,resetsAt:'2026-11-25T00:00:00Z'},monthly:{used:6,limit:null,resetsAt:'2026-12-01T00:00:00Z'}});
 mode='error';assert.equal(await getResendUsage('re_usage_key_12345'),null);assert.equal(await getResendUsage('invalid'),null);assert.equal(requests,2);
});

test('Resend quota failures and malformed success responses are treated as failures',async(t)=>{
 let status=429;t.mock.method(globalThis,'fetch',async()=>status===429?new Response('sensitive provider message',{status:429}):Response.json({}));
 const mailer=makeResendEmail('re_test_key_12345');await assert.rejects(mailer.send({}),error=>error.message==='Email delivery request failed');
 status=200;await assert.rejects(mailer.send({}),/response invalid/);
});
