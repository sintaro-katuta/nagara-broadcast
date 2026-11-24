import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountApi} from '../cloudflare/account-api.mjs';

const sqlite=await import('node:sqlite').catch(()=>null);
test('account API rejects unauthorized access and isolates accounts', {skip:!sqlite&&'node:sqlite unavailable'}, async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 sql.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../cloudflare/migrations/0001_account_data.sql',import.meta.url),'utf8'));
 sql.exec("INSERT INTO accounts VALUES ('a'),('b'); INSERT INTO episodes VALUES ('ep','title','tech','','',10,3,'2026-01-01','audio/ep')");
 const db={prepare(query){return {bind(...args){return {async run(){return sql.prepare(query).run(...args)},async all(){return {results:sql.prepare(query).all(...args)}},async first(){return sql.prepare(query).get(...args)||null}}},async all(){return {results:sql.prepare(query).all()}}}}};
 const request=(path,opts={})=>new Request('https://radio.example'+path,opts);
 const a=async()=>({accountId:'a',admin:false,sessionTag:'tag-a'}),b=async()=>({accountId:'b',admin:false,sessionTag:'tag-b'}),admin=async()=>({accountId:'a',admin:true,sessionTag:'tag-a'});
 const put=(body,origin='https://radio.example',tag='tag-a')=>({method:'PUT',headers:{'Content-Type':'application/json',Origin:origin,'X-Account-Session':tag},body:JSON.stringify(body)});
 assert.equal((await accountApi(request('/api/account'),db,async()=>null)).status,401);
 assert.equal((await accountApi(request('/api/admin/storage'),db,a)).status,403);
 assert.equal((await accountApi(request('/api/admin/storage'),db,admin)).status,200);
 assert.equal((await accountApi(request('/api/account/favorite',put({episodeId:'ep',enabled:true},'https://evil.example')),db,a)).status,403);
 assert.equal((await accountApi(request('/api/account/favorite',put({episodeId:'ep',enabled:true})),db,b)).status,409);
 assert.equal((await accountApi(request('/api/account/favorite',put({episodeId:'ep',enabled:true,accountId:'b'})),db,a)).status,200);
 assert.deepEqual((await (await accountApi(request('/api/account'),db,b)).json()).favorites,[]);
 assert.deepEqual((await (await accountApi(request('/api/account'),db,a)).json()).favorites,['ep']);
 assert.equal((await accountApi(request('/api/account/history',put({episodeId:'ep',positionSeconds:-1})),db,a)).status,400);
 assert.equal((await accountApi(request('/api/account/favorite',put({episodeId:'unknown',enabled:true})),db,a)).status,404);
 sql.close();
});
