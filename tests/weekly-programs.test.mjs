import test from 'node:test';
import assert from 'node:assert/strict';
import {programForDate,weeklyPrograms} from '../lib/weekly-programs.mjs';

test('weekday selects the programme and cast uses unique models',()=>{
 assert.equal(programForDate('2026-11-02').title,'何でもマンデー');
 assert.equal(programForDate('2026-11-02').cast[0].voice,'阿井田 茂');
 assert.equal(programForDate('2026-11-02').cast[0].style,'ノーマル');
 assert.equal(programForDate('2026-11-03').cast.length,1);
 assert.equal(programForDate('2026-11-07').cast.length,1);
 assert.equal(programForDate('2026-11-08').title,'気持ちのひとしお');
 const models=weeklyPrograms.flatMap(program=>program.cast.map(person=>person.voice));
 assert.equal(models.length,12);
 assert.equal(new Set(models).size,models.length);
 assert.equal(programForDate('2026-11-04').cast[1].reading,'あさひな ともしび');
 assert.throws(()=>programForDate('2026-02-30'));
});

test('Tuesday keeps an explicit energetic direction and its installed voice',()=>{
 const tuesday=programForDate('2026-11-17');
 assert.match(tuesday.direction,/情熱|熱血/);
 assert.match(tuesday.direction,/気合い/);
 assert.equal(tuesday.cast[0].voice,'銀芽(ぎんが)');
 assert.equal(tuesday.cast[0].style,'通常');
 assert.equal(tuesday.credit,'音声：AI声優-銀芽');
 assert.equal(programForDate('2026-11-18').direction,undefined);
});
