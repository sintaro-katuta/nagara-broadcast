import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendEnrollmentEmail} from '../cloudflare/enrollment-email.mjs';

test('enrollment email uses a fragment and rejects unsafe configuration',async()=>{
 let message;const binding={async send(value){message=value}};
 const settings={origin:'https://radio.example',from:'no-reply@example.com',to:'user@example.com',token:'a'.repeat(64)};
 await sendEnrollmentEmail(binding,settings);
 assert.equal(message.to,settings.to);assert.equal(message.from,settings.from);
 assert.match(message.text,/https:\/\/radio\.example\/#confirm-email=/);
 await assert.rejects(sendEnrollmentEmail(binding,{...settings,origin:'https://radio.example/other'}));
 await assert.rejects(sendEnrollmentEmail(binding,{...settings,token:'bad'}));
 await assert.rejects(sendEnrollmentEmail(binding,{...settings,to:'bad\r\nBcc:x@example.com'}));
});
