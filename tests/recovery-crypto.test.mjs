import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEmail,emailLookup,encryptEmail,decryptEmail} from '../cloudflare/recovery-crypto.mjs';

test('email lookup is keyed and encrypted email is bound to its account',async()=>{
 const lookup=crypto.getRandomValues(new Uint8Array(32)),secret=crypto.getRandomValues(new Uint8Array(32));
 assert.equal(normalizeEmail(' A@EXAMPLE.COM '),'A@example.com');
 const id=await emailLookup('A@example.com',lookup);
 assert.equal(id,await emailLookup('A@EXAMPLE.COM',lookup));
 assert.notEqual(id,await emailLookup('a@example.com',lookup));
 assert.notEqual(id,await emailLookup('A@example.com',secret));
 const a=await encryptEmail('A@example.com','account-a',secret),b=await encryptEmail('A@example.com','account-a',secret);
 assert.notEqual(a,b);assert.equal(await decryptEmail(a,'account-a',secret),'A@example.com');
 await assert.rejects(decryptEmail(a,'account-b',secret));
 await assert.rejects(encryptEmail('x@example.com','account-a',new Uint8Array(3)));
 assert.throws(()=>normalizeEmail('x@example.com\r\nBcc:x@example.com'));
});
