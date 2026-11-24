import test from 'node:test';
import assert from 'node:assert/strict';
import {buildQueue,nextIds,previousId,resumePosition,createPositionWriter} from '../public/player-model.js';
test('a filtered playlist continues only within that list',()=>{
 const all=[{id:'a'},{id:'b'},{id:'c'}];
 const queue=buildQueue([all[0],all[2]],all,'a');
 assert.deepEqual(queue,['a','c']);assert.deepEqual(nextIds(queue,'a'),['c']);
});
test('a featured episode outside the current filter builds a complete queue without duplicates',()=>{
 const all=[{id:'a'},{id:'b'},{id:'b'},{id:'c'}];
 assert.deepEqual(buildQueue([{id:'b'}],all,'a'),['a','b','c']);
});
test('the queue ends without cycling and an unknown selection cannot skip to the first item',()=>{
 assert.deepEqual(nextIds(['a','b'],'b'),[]);assert.deepEqual(nextIds(['a','b'],'missing'),[]);
});
test('previous stays inside the current queue and does not wrap',()=>{
 assert.equal(previousId(['a','c'],'c'),'a');
 assert.equal(previousId(['a','c'],'a'),null);
 assert.equal(previousId(['a','c'],'missing'),null);
});
test('initial sync uses the saved position only after duration is known',()=>{
 assert.equal(resumePosition(undefined,120,false),null);
 assert.equal(resumePosition(37,120,false),null);
 assert.equal(resumePosition(37,120,true),37);
 assert.equal(resumePosition(37,NaN),null);
 assert.equal(resumePosition(37,Infinity),null);
 assert.equal(resumePosition(37,120),37);
 assert.equal(resumePosition(119,120),0);
});
test('position writes start immediately even while an earlier request is pending',async()=>{
 const requests=[];let resolveFirst,signedIn=true;const first=new Promise(resolve=>{resolveFirst=resolve});
 const account={isSignedIn:()=>signedIn,setPosition(...args){requests.push(args);return requests.length===1?first:Promise.resolve();}};
 const send=createPositionWriter(account,'writer-1234567890',()=>assert.fail('unexpected failure'));
 const pending=send('ep',30);const pause=send('ep',45);assert.deepEqual(requests.map(row=>[row[1],row[3],row[4]]),[[30,1,false],[45,2,false]]);
 signedIn=false;send('ep',50);signedIn=true;const final=send('ep',60,true);assert.deepEqual(requests[2],['ep',60,'writer-1234567890',3,true]);
 await pause;await final;resolveFirst();await pending;
});
