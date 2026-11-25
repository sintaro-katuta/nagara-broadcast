const key=process.env.NAGARA_STAGE_RESEND_KEY;
if(!/^re_[A-Za-z0-9_-]{10,250}$/.test(key||''))throw new Error('Staging email key is not in the expected format');
// An empty request cannot send an email; its response distinguishes authentication
// rejection from normal payload validation without disclosing the key or an address.
const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(10000)});
const body=await response.json().catch(()=>null),name=typeof body?.name==='string'&&/^[a-z_]{1,80}$/.test(body.name)?body.name:'unknown';
console.log(`Resend empty-request status: ${response.status}; category: ${name}`);
