import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {episodeTitle} from '../public/programs.js';
import {validateCaptions} from '../lib/captions.mjs';
const date=process.argv[2];if(!/^2026-11-\d\d$/.test(date||''))throw Error('日付が不正です。');
const dir=path.resolve('work/caption-recovery',date), script=JSON.parse(await readFile(`data/weekly/${date}/script.json`,'utf8'));
const captions=validateCaptions(JSON.parse(await readFile(path.join(dir,'captions.json'),'utf8')));
const quality=JSON.parse(await readFile(path.join(dir,'quality.json'),'utf8'));
if(quality.minCorrelation<0.025||captions.length!==script.turns.length||captions.some((cue,i)=>cue.text!==script.turns[i].text))throw Error('字幕の検証に失敗しました。');
const origin='https://nagara-broadcast.sintaro-katuta.com',id=`daily-${date}`;
const catalog=await fetch(origin+'/api/episodes',{signal:AbortSignal.timeout(30000)}).then(r=>r.json());
const episode=catalog.episodes.find(e=>e.id===id);
if(!episode||episode.title!==episodeTitle({id,title:script.title}))throw Error('公開中のエピソードと台本が一致しません。');
const url=origin+'/api/episodes/'+id+'/captions';
const existing=await fetch(url,{signal:AbortSignal.timeout(30000)});
if(existing.ok){const value=await existing.json();if(JSON.stringify(value)!==JSON.stringify(captions))throw Error('既存の字幕があるため上書きしません。');}
else if(existing.status===404){const secret=(await readFile('data/weekly/upload-secret','utf8')).trim();const result=await fetch(url,{method:'PUT',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(captions),signal:AbortSignal.timeout(30000)});if(!result.ok)throw Error(`字幕保存失敗 HTTP ${result.status}`);}
else throw Error(`字幕取得失敗 HTTP ${existing.status}`);
const verify=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!verify.ok||JSON.stringify(await verify.json())!==JSON.stringify(captions))throw Error('公開後の字幕検証に失敗しました。');
await writeFile(path.join(dir,'published.json'),JSON.stringify({id,count:captions.length,minCorrelation:quality.minCorrelation},null,2)+'\n');console.log(`${date} 字幕公開・取得確認 ${captions.length}件`);
