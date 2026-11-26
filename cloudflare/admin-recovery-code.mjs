const encoder=new TextEncoder();
export async function adminRecoveryApprovalCode(browserHash){
 if(typeof browserHash!=='string'||!/^[a-f0-9]{64}$/.test(browserHash))throw new TypeError('invalid recovery request');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode('nagara-admin-recovery-v1:'+browserHash)));
 return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
}
