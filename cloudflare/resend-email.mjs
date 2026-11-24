// Resend credentials stay on the Worker; provider responses and message bodies
// are never written to logs. The adapter implements the existing email interface.
export function makeResendEmail(apiKey){
 if(typeof apiKey!=='string'||!/^re_[A-Za-z0-9_-]{10,250}$/.test(apiKey))return null;
 return {async send(message,options={}){
  const headers={'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'};
  if(options.idempotencyKey)headers['Idempotency-Key']=options.idempotencyKey;
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers,body:JSON.stringify(message),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw new Error('Email delivery request failed');
  const result=await response.json();if(typeof result?.id!=='string'||!result.id)throw new Error('Email delivery response invalid');
 }};
}

export async function getResendUsage(apiKey){
 if(typeof apiKey!=='string'||!/^re_[A-Za-z0-9_-]{10,250}$/.test(apiKey))return null;
 try{
  const response=await fetch('https://api.resend.com/usage',{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!response.ok)return null;
  const data=await response.json();
  const read=window=>{
   if(!window||!Number.isSafeInteger(window.used)||window.used<0||!(window.limit===null||Number.isSafeInteger(window.limit)&&window.limit>=0)||typeof window.resets_at!=='string'||!Number.isFinite(Date.parse(window.resets_at)))throw new Error();
   return {used:window.used,limit:window.limit,resetsAt:window.resets_at};
  };
  return {daily:read(data?.emails?.daily),monthly:read(data?.emails?.monthly)};
 }catch{return null;}
}
