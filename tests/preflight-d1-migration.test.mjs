import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preflight,checkMigrationFiles} from '../scripts/preflight-d1-migration.mjs';
const id='a'.repeat(32),columns=['id','title','channel','description','source','duration','size','date','object_key'].map(name=>({name,pk:name==='id'?1:0}));
const mock=(tables,cols=columns)=>async(url,options)=>Response.json({success:true,result:[{results:JSON.parse(options.body).sql.startsWith('PRAGMA')?cols:tables.map(name=>({name,type:'table'}))}]});
test('preflight requires compatible episode columns and no auth tables',async()=>{
 await checkMigrationFiles();
 assert.equal(await preflight({accountId:id,token:'secret',fetcher:mock(['episodes'])}),true);
 for(const tables of [[],['episodes','accounts'],['episodes','d1_migrations'],['episodes','recovery_emails'],['episodes','account_deletion_attempts_expiry']])await assert.rejects(preflight({accountId:id,token:'secret',fetcher:mock(tables)}));
 await assert.rejects(preflight({accountId:id,token:'secret',fetcher:mock(['episodes'],columns.filter(c=>c.name!=='id'))}));
});
