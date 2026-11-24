import {generateAuthenticationOptions,generateRegistrationOptions,verifyAuthenticationResponse,verifyRegistrationResponse} from '@simplewebauthn/server';

// Internal helpers: callers must bind registration to an authenticated or verified
// recovery transaction, and atomically consume a fresh challenge before verification.
function relyingParty(origin) {
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw new TypeError('invalid relying party origin');
 return url.hostname;
}
export async function registrationOptions(origin,accountId,exclude=[]) {
 if(typeof accountId!=='string'||!accountId)throw new TypeError('account required');
 return generateRegistrationOptions({rpName:'ながら放送',rpID:relyingParty(origin),userID:new TextEncoder().encode(accountId),userName:accountId,userDisplayName:'ながら放送',attestationType:'none',excludeCredentials:exclude.map(id=>({id})),authenticatorSelection:{residentKey:'required',userVerification:'required'}});
}
export async function authenticationOptions(origin) {
 return generateAuthenticationOptions({rpID:relyingParty(origin),userVerification:'required'});
}
export async function verifyRegistration(origin,challenge,response) {
 return verifyRegistrationResponse({response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:relyingParty(origin),requireUserVerification:true});
}
export async function verifyAuthentication(origin,challenge,response,credential) {
 return verifyAuthenticationResponse({response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:relyingParty(origin),credential,requireUserVerification:true});
}
