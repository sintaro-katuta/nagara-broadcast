import worker from './worker.mjs';
import {makeStagingGate} from './staging-gate.mjs';
import {makeResendEmail,ResendDeliveryError} from './resend-email.mjs';
import {parseRange} from '../lib/core.mjs';

// A silent, synthetic recording exists only in the isolated preview Worker.
const fixture=(()=>{const rate=8000,seconds=30,bytes=new Uint8Array(44+rate*2*seconds),v=new DataView(bytes.buffer);const label=(offset,s)=>{for(let i=0;i<s.length;i++)bytes[offset+i]=s.charCodeAt(i);};label(0,'RIFF');v.setUint32(4,bytes.length-8,true);label(8,'WAVE');label(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);label(36,'data');v.setUint32(40,bytes.length-44,true);return bytes;})();

// Scheduled notifications are deliberately omitted from the preview.
export default makeStagingGate({async fetch(request,env,ctx){
 if(new URL(request.url).pathname==='/audio/preview-audio-fixture.mp3'&&['GET','HEAD'].includes(request.method)){
  const range=parseRange(request.headers.get('Range'),fixture.length);if(range===false)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${fixture.length}`}});
  const start=range?.start??0,end=range?.end??fixture.length-1,headers={'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':String(end-start+1)};
  if(range)headers['Content-Range']=`bytes ${start}-${end}/${fixture.length}`;
  return new Response(request.method==='HEAD'?null:fixture.slice(start,end+1),{status:range?206:200,headers});
 }
 if(new URL(request.url).pathname==='/__preview/resend-diagnostic'&&request.method==='POST'&&request.headers.get('Origin')===env.AUTH_ORIGIN){
  const email=makeResendEmail(env.RESEND_API_KEY);
  let result={configured:!!email,timeoutAvailable:typeof AbortSignal.timeout==='function'};
  if(email){try{await email.send({});result.outcome='unexpected-success';}catch(error){result.outcome=error instanceof ResendDeliveryError?'provider-response':error?.name==='TimeoutError'?'timeout':error?.name==='AbortError'?'abort':'other';if(error instanceof ResendDeliveryError)result.status=error.status;const safe=x=>typeof x==='string'?x.replace(/https?:\/\/\S+/g,'[url]').replace(/re_[A-Za-z0-9_-]+/g,'[key]').replace(/[^\x20-\x7e]/g,'?').slice(0,200):'';result.name=safe(error?.name);result.message=safe(error?.message);result.cause=safe(error?.cause?.message);}}
  return Response.json(result);
 }
 return worker.fetch(request,env,ctx);
}});
