import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registrationOptions,authenticationOptions,verifyRegistration,verifyAuthentication} from '../cloudflare/passkeys.mjs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';

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

test('real WebAuthn signatures validate only for the expected origin and challenge',async()=>{
 const origin='https://radio.example',challenge=(await authenticationOptions(origin)).challenge;
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const jwk=publicKey.export({format:'jwk'}),x=Buffer.from(jwk.x,'base64url'),y=Buffer.from(jwk.y,'base64url');
 // COSE EC2 key: kty=2, alg=-7, crv=1, x, y.
 const cose=Buffer.concat([Buffer.from('a5010203262001215820','hex'),x,Buffer.from('225820','hex'),y]);
 const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin,crossOrigin:false}));
 const data=Buffer.concat([createHash('sha256').update('radio.example').digest(),Buffer.from([5,0,0,0,1])]);
 const signed=Buffer.concat([data,createHash('sha256').update(client).digest()]);
 const response={id:'Y3JlZA',rawId:'Y3JlZA',type:'public-key',clientExtensionResults:{},response:{clientDataJSON:client.toString('base64url'),authenticatorData:data.toString('base64url'),signature:sign('sha256',signed,privateKey).toString('base64url'),userHandle:null}};
 const credential={id:'Y3JlZA',publicKey:new Uint8Array(cose),counter:0,transports:[]};
 const result=await verifyAuthentication(origin,challenge,response,credential);
 assert.equal(result.verified,true);assert.equal(result.authenticationInfo.newCounter,1);
 await assert.rejects(verifyAuthentication(origin,'different-challenge',response,credential));
 await assert.rejects(verifyAuthentication('https://other.example',challenge,response,credential));
});
