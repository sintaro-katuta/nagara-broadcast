import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storageSummary} from '../cloudflare/storage-summary.mjs';

test('summarizes all registered audio by program without inventing a quota',async()=>{
 const rows=[{id:'daily-2026-11-23',title:'朝',size:100},{id:'other',title:'別番組',size:30}];
 const db={prepare(){return {async all(){return {results:rows}}}}};
 const data=await storageSummary(db);
 assert.equal(data.bytes,130);assert.equal(data.count,2);assert.equal(data.limit,null);
 assert.equal(data.programs.find(x=>x.program==='何でもマンデー').bytes,100);
 assert.equal(data.programs.find(x=>x.program==='その他').count,1);
 rows[0].size=-1;await assert.rejects(storageSummary(db));
});
