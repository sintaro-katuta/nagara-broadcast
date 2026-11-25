import worker from './worker.mjs';
import {makeStagingGate} from './staging-gate.mjs';
import {makeResendEmail,ResendDeliveryError} from './resend-email.mjs';

// Scheduled notifications are deliberately omitted from the preview.
export default makeStagingGate({async fetch(request,env,ctx){
 if(new URL(request.url).pathname==='/__preview/resend-diagnostic'&&request.method==='POST'&&request.headers.get('Origin')===env.AUTH_ORIGIN){
  const email=makeResendEmail(env.RESEND_API_KEY);
  let result={configured:!!email,timeoutAvailable:typeof AbortSignal.timeout==='function'};
  if(email){try{await email.send({});result.outcome='unexpected-success';}catch(error){result.outcome=error instanceof ResendDeliveryError?'provider-response':error?.name==='TimeoutError'?'timeout':error?.name==='AbortError'?'abort':'other';if(error instanceof ResendDeliveryError)result.status=error.status;const safe=x=>typeof x==='string'?x.replace(/https?:\/\/\S+/g,'[url]').replace(/re_[A-Za-z0-9_-]+/g,'[key]').replace(/[^\x20-\x7e]/g,'?').slice(0,200):'';result.name=safe(error?.name);result.message=safe(error?.message);result.cause=safe(error?.cause?.message);}}
  return Response.json(result);
 }
 return worker.fetch(request,env,ctx);
}});
