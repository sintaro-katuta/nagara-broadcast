import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {weeklyPrograms,programForDate} from '../lib/weekly-programs.mjs';
import {buildWeeklyPrompt} from '../lib/weekly-prompt.mjs';

test('the current persona source covers every scheduled presenter',async()=>{
 const bios=await readFile(new URL('../docs/weekly-personas.md',import.meta.url),'utf8');
 for(const programme of weeklyPrograms)for(const person of programme.cast){
  assert.ok(bios.includes(person.name),person.name);
  assert.ok(bios.includes(person.reading),person.reading);
 }
 assert.match(bios,/前回話したことをまた話したり/);
 assert.match(bios,/届いたと偽らない/);
});

test('draft prompt applies current personas and keeps past scripts subordinate',async()=>{
 const bios=await readFile(new URL('../docs/weekly-personas.md',import.meta.url),'utf8');
 const prompt=buildWeeklyPrompt({programme:programForDate('2026-11-21'),date:'2026-11-21',previous:['話題'],lastScript:'前回の話',feedback:'感想',bios});
 for(const value of ['前回の話','感想','土曜は直近の台本にある小話を自然に繰り返してよい','現在の人物設定を過去の台本より優先','長谷川 歩','橘 悠介'])assert.ok(prompt.includes(value),value);
});
