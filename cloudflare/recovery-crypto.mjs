const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));

export function normalizeEmail(input) {
 if(typeof input!=='string')throw new TypeError('invalid email');
 const email=input.trim();
 if(email.length>254||/[\s\x00-\x1f\x7f]/.test(email)||!/^[^@]+@[^@]+\.[^@]+$/.test(email))throw new TypeError('invalid email');
 const at=email.lastIndexOf('@');return email.slice(0,at)+'@'+email.slice(at+1).toLowerCase();
}
function keyBytes(bytes){if(!(bytes instanceof Uint8Array)||bytes.length!==32)throw new TypeError('a 256-bit key is required');return bytes;}
export async function emailLookup(email,key) {
 const k=await crypto.subtle.importKey('raw',keyBytes(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return b64(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(normalizeEmail(email)))));
}
export async function encryptEmail(email,accountId,key) {
 if(typeof accountId!=='string'||!accountId)throw new TypeError('account required');
 const k=await crypto.subtle.importKey('raw',keyBytes(key),'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(accountId)},k,enc.encode(normalizeEmail(email)));
 return `${b64(iv)}.${b64(new Uint8Array(ciphertext))}`;
}
export async function decryptEmail(value,accountId,key) {
 if(typeof accountId!=='string'||!accountId||typeof value!=='string'||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))throw new TypeError('invalid encrypted email');
 const [iv,body]=value.split('.').map(unb64);
 const k=await crypto.subtle.importKey('raw',keyBytes(key),'AES-GCM',false,['decrypt']);
 return new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode(accountId)},k,body));
}
