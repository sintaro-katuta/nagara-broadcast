import {createHmac} from 'node:crypto';
const key=process.env.AUTH_RATE_KEY;
if(!/^[a-f0-9]{64}$/i.test(key||''))throw new Error('Authentication key is unavailable');
const time=String(Math.floor(Date.now()/1000));
const signature=createHmac('sha256',Buffer.from(key,'hex')).update(`nagara-production-mail-check:v1\0${time}`).digest('hex');
const response=await fetch('https://nagara-broadcast.sintaro-katuta.com/api/internal/production-mail-check',{method:'POST',headers:{'X-Mail-Check-Time':time,'X-Mail-Check-Signature':signature},redirect:'error',signal:AbortSignal.timeout(20000)});
if(response.status!==204)throw new Error(`Production email check failed (HTTP ${response.status})`);
console.log('Resend accepted the test message; check its delivery status in Resend.');
