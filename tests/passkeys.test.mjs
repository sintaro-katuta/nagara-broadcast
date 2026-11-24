import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registrationOptions,authenticationOptions,verifyRegistration,verifyAuthentication} from '../cloudflare/passkeys.mjs';

test('passkey options require user verification and a secure relying party',async()=>{
 const registration=await registrationOptions('https://radio.example','random-user');
 assert.equal(registration.rp.id,'radio.example');
 assert.equal(registration.authenticatorSelection.residentKey,'required');
 assert.equal(registration.authenticatorSelection.userVerification,'required');
 const login=await authenticationOptions('https://radio.example');
 assert.equal(login.rpId,'radio.example');assert.equal(login.userVerification,'required');
 assert.notEqual(registration.challenge,login.challenge);
 await assert.rejects(registrationOptions('http://radio.example','user'));
 await assert.rejects(authenticationOptions('https://radio.example/path'));
 await assert.rejects(registrationOptions('https://radio.example',''));
});

test('malformed passkey responses never authenticate',async()=>{
 await assert.rejects(verifyRegistration('https://radio.example','challenge',{}));
 await assert.rejects(verifyAuthentication('https://radio.example','challenge',{},{}));
});
