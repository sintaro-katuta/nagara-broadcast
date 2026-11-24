import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {synthesizeDialogue} from '../lib/aivis.mjs';
const date=process.argv[2];
if(!/^2026-11-\d\d$/.test(date||''))throw Error('日付が不正です');
const dir=path.resolve('data/weekly',date),out=path.resolve('work/caption-recovery',date);
await mkdir(out,{recursive:true});
const script=JSON.parse(await readFile(path.join(dir,'script.json'),'utf8'));
await synthesizeDialogue(script,{onTurn:async({index,wav})=>{await writeFile(path.join(out,`${index}.wav`),wav);console.log(`${date} ${index+1}/${script.turns.length}`);}});
