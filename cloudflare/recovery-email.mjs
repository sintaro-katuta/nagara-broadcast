import {normalizeEmail} from './recovery-crypto.mjs';

// Fragment-only token; the page must remove it from history and ask for an
// explicit user action before sending a POST to consume it.
export async function sendRecoveryEmail(binding,{origin,from,to,token}){
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw new TypeError('invalid origin');
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new TypeError('invalid token');
 const sender=normalizeEmail(from),recipient=normalizeEmail(to),link=`${origin}/#recover-account=${token}`;
 await binding.send({from:sender,to:recipient,subject:'ながら放送 アカウント復旧のご案内',text:`パスキーを再登録するには、次のリンクを開いてください。\n\n${link}\n\nこのリンクは15分間有効です。心当たりがない場合は、このメールを無視してください。`});
}
