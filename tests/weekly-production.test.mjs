import test from 'node:test';
import assert from 'node:assert/strict';
import {japaneseDate,afterRelease,beforeProduction,makeScript} from '../lib/weekly-production.mjs';

test('production and release use Japan time',()=>{
 assert.equal(japaneseDate(new Date('2026-11-01T15:05:00Z')),'2026-11-02');
 assert.equal(beforeProduction(new Date('2026-11-01T20:59:00Z')),true);
 assert.equal(beforeProduction(new Date('2026-11-01T21:00:00Z')),false);
 assert.equal(afterRelease(new Date('2026-11-01T21:59:00Z')),false);
 assert.equal(afterRelease(new Date('2026-11-01T22:00:00Z')),true);
});
test('generated script is bound to the day’s cast and malformed drafts fail',()=>{
 const turns=Array.from({length:8},(_,i)=>({speaker:i%2?'tsumugi':'ayumu',text:'あしたのお話です。'.repeat(8)}));
 const draft={topic:'小さな発見',description:'朝の小さな話です。',turns};
 const s=makeScript('2026-11-02',draft);
 assert.deepEqual(Object.keys(s.voices),['ayumu','tsumugi']);
 assert.equal(s.voices.tsumugi.name,'まい');
 const spoken=makeScript('2026-11-02',{...draft,turns:turns.map(t=>({...t,text:t.text+'長谷川歩です。歩さん、真鍋紬さん。'}))});
 assert.match(spoken.turns[0].text,/はせがわあゆむです。あゆむさん、まなべつむぐさん。/);
 const wed={topic:'音楽',description:'音楽の話です。',turns:Array.from({length:8},(_,i)=>({speaker:i%2?'tomoshibi':'ritsu',text:'曲のお話をします。'.repeat(8)+'朝比奈灯です。灯さん。'}))};
 assert.match(makeScript('2026-11-04',wed).turns[0].text,/あさひなともしびです。ともしびさん。/);
 const wedNames=makeScript('2026-11-04',{...wed,turns:wed.turns.map(t=>({...t,text:t.text+'音羽律です。'}))});
 assert.match(wedNames.turns[0].text,/おとはりつです。/);
 assert.throws(()=>makeScript('2026-11-02',{...draft,turns:turns.map(t=>({...t,speaker:'intruder'}))}));
 assert.throws(()=>makeScript('2026-11-02',{...draft,turns:turns.slice(0,2)}));
});

test('the music break is preserved at exactly one dialogue boundary',()=>{
 const turns=Array.from({length:8},(_,i)=>({speaker:i%2?'tsumugi':'ayumu',text:'会話の続きをお届けします。'.repeat(8),musicAfter:i===3}));
 const draft={topic:'音のある午後',description:'音にまつわるお話です。',turns};
 const script=makeScript('2026-11-02',draft);
 assert.equal(script.turns[3].musicAfter,true);
 assert.equal(script.turns.filter(t=>t.musicAfter).length,1);
 assert.throws(()=>makeScript('2026-11-02',{...draft,turns:turns.map(t=>({...t,musicAfter:false}))}),/1か所/);
 assert.throws(()=>makeScript('2026-11-02',{...draft,turns:turns.map((t,i)=>({...t,musicAfter:i===7}))}),/1か所/);
});

test('Tuesday includes the required voice credit within the description limit',()=>{
 const turns=Array.from({length:8},()=>({speaker:'daichi',text:'気合いを入れて今日も行こうぜ。'.repeat(8)}));
 const script=makeScript('2026-11-17',{topic:'一歩踏み出す',description:'挑戦の話'.repeat(40),turns});
 assert.equal(script.voices.daichi.name,'銀芽(ぎんが)');
 assert.equal(script.voices.daichi.styleName,'通常');
 assert.ok(script.description.length<=200);
 assert.match(script.description,/音声：AI声優-銀芽$/);
});

test('Friday uses Kanae and includes the required credit',()=>{
 const turns=Array.from({length:8},(_,i)=>({speaker:i%2?'gaku':'chihiro',text:'お金と暮らしについて考えてみましょう。'.repeat(8)}));
 const script=makeScript('2026-11-27',{topic:'暮らしのお金',description:'今日の話'.repeat(40),turns});
 assert.equal(script.voices.chihiro.name,'金苗(かなえ)');
 assert.equal(script.voices.chihiro.styleName,'ノーマル');
 assert.ok(script.description.length<=200);
 assert.match(script.description,/音声：AI声優-金苗$/);
});
