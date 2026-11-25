import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectD1} from '../scripts/inspect-d1.mjs';

test('inspection uses fixed reads and reports only known migration metadata',async()=>{
 const calls=[],fetcher=async(url,options)=>{calls.push({url,options});return Response.json({success:true,result:[{results:calls.length===1?[{name:'episodes'},{name:'d1_migrations'}]:[{name:'0001_one.sql'},{name:'unknown-sensitive'}]}]});};
 const value=await inspectD1({accountId:'a'.repeat(32),token:'secret',files:['0001_one.sql','0002_two.sql'],fetcher});
 assert.deepEqual(value,{episodes:true,accounts:false,ledger:true,applied:['0001_one.sql'],pending:['0002_two.sql'],unknownCount:1});
 assert.equal(calls.length,2);assert.ok(calls.every(x=>/^SELECT /.test(JSON.parse(x.options.body).sql)));
 assert.equal(JSON.stringify(value).includes('secret'),false);assert.equal(JSON.stringify(value).includes('unknown-sensitive'),false);
});
test('inspection handles a missing migration ledger and does not expose provider errors',async()=>{
 let calls=0;const result=await inspectD1({accountId:'a'.repeat(32),token:'secret',files:['0001_one.sql'],fetcher:async()=>{calls++;return Response.json({success:true,result:[{results:[{name:'episodes'}]}]});}});
 assert.equal(calls,1);assert.deepEqual(result.pending,['0001_one.sql']);assert.equal(result.ledger,false);
 await assert.rejects(inspectD1({accountId:'a'.repeat(32),token:'secret',files:[],fetcher:async()=>new Response('secret details',{status:403})}),error=>!error.message.includes('secret')&&/403/.test(error.message));
});
