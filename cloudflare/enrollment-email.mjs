import {normalizeEmail} from './recovery-crypto.mjs';

// No public endpoint uses this yet. The caller must rate-limit and suppress
// account enumeration before delivering or reporting the outcome.
export async function sendEnrollmentEmail(binding,{origin,from,to,token}){
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw new TypeError('invalid origin');
 if(!/^[a-f0-9]{64}$/.test(token))throw new TypeError('invalid token');
 const sender=normalizeEmail(from),recipient=normalizeEmail(to);
 // Fragments are not sent in HTTP requests. The page must remove the fragment
 // from browser history and require an explicit user action before confirmation.
 const link=`${origin}/#confirm-email=${token}`;
 await binding.send({from:sender,to:recipient,subject:'ながら放送 メールアドレスの確認',text:`ながら放送の登録を続けるには、次のリンクを開いてください。\n\n${link}\n\nこのリンクは15分間有効です。心当たりがない場合は、このメールを無視してください。`});
}
