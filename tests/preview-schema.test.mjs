import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const sqlite=await import('node:sqlite').catch(()=>null);
test('a fresh test database can serve the episode query after base schema and migrations',{skip:!sqlite&&'node:sqlite unavailable'},()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 sql.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
 for(const file of readdirSync(new URL('../cloudflare/migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../cloudflare/migrations/'+file,import.meta.url),'utf8'));
 assert.deepEqual(sql.prepare('SELECT id,title,channel,description,source,duration,size,date FROM episodes ORDER BY date DESC LIMIT 1000').all(),[]);
 sql.close();
});
