import worker from './worker.mjs';
import {makeStagingGate} from './staging-gate.mjs';
import {makeResendEmail,ResendDeliveryError} from './resend-email.mjs';

// Scheduled notifications are deliberately omitted from the preview.
export default makeStagingGate({async fetch(request,env,ctx){
 if(new URL(request.url).pathname==='/__preview/resend-diagnostic'&&request.method==='POST'&&request.headers.get('Origin')===env.AUTH_ORIGIN){
  const email=makeResendEmail(env.RESEND_API_KEY);
  let result={configured:!!email,timeoutAvailable:typeof AbortSignal.timeout==='function'};
  if(email){try{await email.send({});result.outcome='unexpected-success';}catch(error){result.outcome=error instanceof ResendDeliveryError?'provider-response':error?.name==='TimeoutError'?'timeout':error?.name==='AbortError'?'abort':'other';if(error instanceof ResendDeliveryError)result.status=error.status;}}
  return Response.json(result);
 }
 return worker.fetch(request,env,ctx);
}});
