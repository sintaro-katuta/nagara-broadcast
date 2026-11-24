import {episodeProgram,programs} from '../public/programs.js';

// Internal helper. Expose only after server-side administrator authorization.
export async function storageSummary(db) {
 const {results}=await db.prepare('SELECT id,title,size FROM episodes').all();
 const groups=new Map(programs.map(p=>[p.name,{program:p.name,count:0,bytes:0}]));
 let unassigned={program:'その他',count:0,bytes:0},total=0;
 for(const row of results){
  const size=Number(row.size);
  if(!Number.isSafeInteger(size)||size<0)throw new Error('invalid episode size');
  const group=groups.get(episodeProgram(row)?.name)||unassigned;
  group.count++;group.bytes+=size;total+=size;
 }
 return {bytes:total,count:results.length,limit:null,programs:[...groups.values(),...(unassigned.count?[unassigned]:[])]};
}
