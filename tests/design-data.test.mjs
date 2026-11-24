import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {programs} from '../public/programs.js';
import {personArt,programArt,programDescriptions} from '../public/design-data.js';

test('all weekly programs and their personalities have accessible design assets',async()=>{
 assert.equal(programDescriptions.length,programs.length);
 for(const [index,program] of programs.entries()){
  assert.ok(programDescriptions[index]);
  const cover=programArt(program.image);
  assert.ok(cover);
  await access(new URL(`../public${cover}`,import.meta.url));
  for(const name of program.cast.split('・')){
   const portrait=personArt(name.trim());
   assert.ok(portrait, name);
   assert.ok(['left','right','center'].includes(portrait.position));
   await access(new URL(`../public${portrait.src}`,import.meta.url));
  }
 }
 assert.equal(programArt('unknown'),null);
 assert.equal(personArt('unknown'),null);
});
